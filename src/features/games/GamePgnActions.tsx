import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Share2 } from 'lucide-react';
import { logGA4Event } from '@/services/analytics';
import type { GameMode } from './gamePgn';

/**
 * Copy PGN, Download PGN and Share for one game (#416), icon buttons sized to the row they sit in (the Moves
 * card's title row on /play and /play-online, whose right side is empty), so the card gains no height.
 *
 * `pgn` is asked for at the press, so it is always the game as it is then: the browser's text during a game
 * against the computer, the server's once the game is stored.
 *
 * Share (`shareId`, a stored game's id, so only once a game has ended and been stored) is a link to the game's
 * public page, /game/<id>: the system share sheet on a phone, the link copied on a computer (owner, 2026-11-22).
 */
export interface GamePgnActionsProps {
  pgn: () => Promise<string> | string;
  fileName: string;
  mode: GameMode;
  surface: 'play_computer' | 'play_online' | 'game_history' | 'shared_game';
  /** The stored game's id: Share appears with it. */
  shareId?: string | null;
  className?: string;
}

/** The public page of a stored game. */
export function sharedGameUrl(id: string): string {
  return `${window.location.origin}/game/${encodeURIComponent(id)}`;
}

/**
 * A phone or tablet (a touch screen): the system share sheet. A computer copies the link (its share sheet is rarely
 * what people use). Read from the device, never the window's size (the layout rule, reentry.test.ts).
 */
function sharesNatively(): boolean {
  try {
    return typeof navigator.share === 'function' && navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

export function GamePgnActions({ pgn, fileName, mode, surface, shareId, className = '' }: GamePgnActionsProps) {
  const [done, setDone] = useState<'copied' | 'link' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flash = (state: 'copied' | 'link' | 'failed') => {
    setDone(state);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 1800);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(await pgn());
      flash('copied');
      logGA4Event({ name: 'game_pgn_copied', params: { mode, surface } });
    } catch {
      flash('failed');
    }
  };

  const download = async () => {
    try {
      const blob = new Blob([`${await pgn()}\n`], { type: 'application/x-chess-pgn' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      logGA4Event({ name: 'game_pgn_downloaded', params: { mode, surface } });
    } catch {
      flash('failed');
    }
  };

  const share = async () => {
    if (!shareId) return;
    const url = sharedGameUrl(shareId);
    if (sharesNatively()) {
      try {
        await navigator.share({ title: 'A game played on Chess Playbook', url });
        logGA4Event({ name: 'game_shared', params: { mode, surface, method: 'share_sheet' } });
      } catch { /* closed the sheet: nothing shared */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      flash('link');
      logGA4Event({ name: 'game_shared', params: { mode, surface, method: 'link_copied' } });
    } catch {
      flash('failed');
    }
  };

  const btn = 'inline-flex items-center justify-center rounded p-[0.25em] -m-[0.25em] text-link hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const icon = 'h-[1.25em] w-[1.25em]';
  return (
    <span className={`inline-flex items-center gap-[0.9em] normal-case tracking-normal ${className}`}>
      <button type="button" onClick={copy} className={btn} title={done === 'copied' ? 'Copied' : 'Copy PGN'} aria-label="Copy PGN">
        {done === 'copied' ? <Check aria-hidden className={icon} /> : <Copy aria-hidden className={icon} />}
      </button>
      <button type="button" onClick={download} className={btn} title="Download PGN" aria-label="Download PGN">
        <Download aria-hidden className={icon} />
      </button>
      {shareId && (
        <button type="button" onClick={share} className={btn} title={done === 'link' ? 'Link copied' : 'Share game'} aria-label="Share game">
          {done === 'link' ? <Check aria-hidden className={icon} /> : <Share2 aria-hidden className={icon} />}
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {done === 'copied' ? 'PGN copied' : done === 'link' ? 'Link to the game copied' : done === 'failed' ? 'That did not work. Try again.' : ''}
      </span>
    </span>
  );
}
