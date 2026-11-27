import { useLayoutEffect, useRef, useState } from 'react';

import { MasterPortrait } from '@/components/master/MasterPortrait';
import type { MasterExpression } from '@/components/master/masterAssets';
import type { MasterSpeech } from '@/components/master/speech';
import { MasterVoiceButton } from '@/features/master/MasterVoiceButton';
import type { useMasterVoice } from '@/features/master/useMasterVoice';

/**
 * THE MASTER ON /play (MASTER_CHARACTER_IMPLEMENTATION_PLAN D4, #186).
 *
 * Two forms, both inside the Play computer card, which never changes size:
 *
 * - `invitation`: before a game. In columns his half body fills the card's empty band (it is the band, so it can
 *   never overflow it) with his line above; stacked (a phone) his face and line sit at the top of the band, the
 *   only part a visitor sees without scrolling (owner rule 2, 2026-11-15).
 * - `strip`: during and after a game, a row of FIXED height above the move list: his face and his current line.
 *   The row's height does not depend on the line, so a new line never moves the list.
 *
 * He is in the right lane, so the pictures are used as made (he turns left, to the board).
 * He is always shown (owner, 2026-11-18: "his primary role is to make the site more lively"; the "Show the
 * Master" switch was removed).
 */
export interface MasterStripProps {
  expression: MasterExpression;
  line: string;
  variant: 'invitation' | 'strip';
  stacked: boolean;
  /** The voice (D8): shown in the game strip only. `speech` is the playing recording and its mouth cues (#298). */
  voice?: Pick<ReturnType<typeof useMasterVoice>, 'on' | 'toggle' | 'volume' | 'setVolume' | 'commitVolume'> & { speech: MasterSpeech | null };
}

const STRIP_FACE = { columns: 64, stacked: 52 };

export function MasterStrip({ expression, line, variant, stacked, voice }: MasterStripProps) {
  if (variant === 'invitation' && !stacked) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center" style={{ gap: 'var(--card-air)' }} data-master="invitation">
        <p className="self-stretch rounded-[0.6em] bg-muted px-[0.7em] py-[0.4em] text-[0.92em] text-foreground">{line}</p>
        <div className="flex min-h-0 w-full flex-1 items-end justify-center">
          <HalfBody expression={expression} />
        </div>
      </div>
    );
  }

  const face = stacked ? STRIP_FACE.stacked : STRIP_FACE.columns;
  const size = variant === 'invitation' ? 96 : face;
  const lineRef = useRef<HTMLParagraphElement>(null);
  const lines = useLinesThatFit(lineRef, size);
  return (
    <div className="flex shrink-0 items-center" style={{ gap: 'calc(var(--card-air) * 2)', height: size }} data-master={variant}>
      {/* mirrored: the v4 heads turn away from the board as drawn (owner, 2026-11-17); the half body is not (his hand presents the board) */}
      <MasterPortrait expression={expression} variant="head" facing="right" size={size} speech={voice?.speech} />
      <p ref={lineRef} title={line} className="min-w-0 flex-1 overflow-hidden rounded-[0.6em] bg-muted px-[0.7em] py-[0.4em] text-[0.92em] leading-snug text-foreground" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines }}>{line}</p>
      {voice && (
        <MasterVoiceButton
          voice={voice}
          className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          iconClassName="h-5 w-5"
        />
      )}
    </div>
  );
}

/**
 * HOW MANY LINES OF HIS LINE THE ROW HOLDS (owner, 2026-11-26: his end line was cut at 800x600, where the row holds 3
 * lines of the small type and the line was clamped to 2). As many as fit in the row's fixed height, never fewer than
 * the 2 it always had (on a phone the row holds 1 and a second line already sits just over its edges). The row's
 * height never changes, so the move list never moves; the type does, with the window, so it is measured again then.
 */
function useLinesThatFit(ref: { current: HTMLParagraphElement | null }, rowHeight: number): number {
  const [lines, setLines] = useState(2);
  useLayoutEffect(() => {
    const p = ref.current;
    if (!p) return;
    const measure = () => {
      const cs = getComputedStyle(p);
      const lh = parseFloat(cs.lineHeight);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      if (!lh) return;
      setLines(Math.max(2, Math.floor((rowHeight - pad) / lh)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(p);
    return () => ro.disconnect();
  }, [ref, rowHeight]);
  return lines;
}

/** The half body, as large as the band allows: a square box whose side is the band's height, capped by its width. */
function HalfBody({ expression }: { expression: MasterExpression }) {
  return (
    <div className="relative aspect-square h-full max-h-full max-w-full" style={{ containerType: 'size' }}>
      <MasterPortrait expression={expression} variant="half" facing="left" size={600} className="!h-full !w-full" />
    </div>
  );
}
