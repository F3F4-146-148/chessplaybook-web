/**
 * A game played on the site, opened from a shared link: /game/<id> (#416, owner 2026-11-22).
 *
 * The game's public read (`GET /api/online-games/:id`, no player ids since #445) on the shared game viewer
 * page: the board, the moves, the players and the result, with Copy PGN, Download PGN and Share above the
 * moves. Public names only (a username, a guest's handle, the Master's or Stockfish's level).
 *
 * NOINDEX TWICE, ON PURPOSE: the served HTML carries it (game-shell.html, served by the CloudFront function),
 * and the rendered page says it again. One person's game is not a page for search.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { GameViewerWorkspace, sideResult } from '@/components/game-viewer/GameViewerWorkspace';
import { GamePgnActions } from '@/features/games/GamePgnActions';
import { gamePgnFileName, type GameMode } from '@/features/games/gamePgn';

interface StoredGame {
  id: string;
  white: { username: string; rating: number | null };
  black: { username: string; rating: number | null };
  result: '1-0' | '0-1' | '1/2-1/2';
  endReason: string;
  timeControl: { initial: number; increment: number; category: string };
  mode?: GameMode;
  pgn: string;
  playedAt: string;
}

const ENDINGS: Record<string, string> = {
  checkmate: 'Checkmate',
  resignation: 'Resignation',
  timeout: 'On time',
  stalemate: 'Stalemate',
  insufficient_material: 'Insufficient material',
  fifty_move: '50-move rule',
  repetition: 'Repetition',
  draw_agreement: 'Draw agreed',
  abandonment: 'Abandoned',
};

const KIND: Record<GameMode, string> = {
  online: 'Online game',
  master: 'A game against the Master',
  stockfish: 'A game against Stockfish',
};

function clockLabel(tc: { initial: number; increment: number }): string {
  if (tc.initial <= 0 && tc.increment <= 0) return 'No clock';
  return `${Math.round(tc.initial / 60)}+${tc.increment}`;
}

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error' } | { state: 'ready'; game: StoredGame };

export default function SharedGame() {
  const { id = '' } = useParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    let alive = true;
    setLoad({ state: 'loading' });
    (async () => {
      try {
        const env = (await import('@/config/env')).default;
        const res = await fetch(`${env.apiBaseUrl}/api/online-games/${encodeURIComponent(id)}`);
        if (!alive) return;
        if (res.status === 404) { setLoad({ state: 'missing' }); return; }
        if (!res.ok) { setLoad({ state: 'error' }); return; }
        const game = await res.json() as StoredGame;
        if (alive) setLoad(game?.pgn ? { state: 'ready', game } : { state: 'missing' });
      } catch {
        if (alive) setLoad({ state: 'error' });
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const game = load.state === 'ready' ? load.game : null;
  const mode: GameMode = game?.mode ?? 'online';
  const title = game ? `${game.white.username} vs ${game.black.username}` : 'A game played on Chess Playbook';
  const playedAt = useMemo(() => (game ? new Date(game.playedAt) : null), [game]);

  const head = (
    <Helmet>
      <title>{`${title} | Chess Playbook`}</title>
      <meta name="robots" content="noindex, follow" />
    </Helmet>
  );

  if (!game) {
    return (
      <>
        {head}
        <div className="flex h-full items-center justify-center p-4">
          <div className="max-w-md space-y-3 text-center">
            {load.state === 'loading' ? (
              <p className="text-muted-foreground">Loading the game.</p>
            ) : (
              <>
                <h1 className="text-xl font-semibold text-foreground">{load.state === 'missing' ? 'Game not found' : 'The game could not be loaded'}</h1>
                <p className="text-muted-foreground">
                  {load.state === 'missing' ? 'The link may be mistyped, or the game is no longer here.' : 'Check your connection and try again.'}
                </p>
                <Link to="/play" className="inline-block text-link hover:underline">Play a game</Link>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  const status = `${game.result} · ${ENDINGS[game.endReason] ?? game.endReason}`;
  // A computer opponent's level is already in its name ("Chess Playbook Master (1400)"): no second number beside it.
  const ratingOf = (side: { username: string; rating: number | null }) =>
    side.rating === null || /\(\d{3,4}\)$/.test(side.username) ? undefined : side.rating;
  const day = playedAt!.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <>
      {head}
      <GameViewerWorkspace
        key={game.id}
        pgn={game.pgn}
        info={{ headline: title, lines: [KIND[mode], `${day} · ${clockLabel(game.timeControl)}`], status }}
        players={{
          white: { name: game.white.username, rating: ratingOf(game.white), detail: sideResult('white', game.result) },
          black: { name: game.black.username, rating: ratingOf(game.black), detail: sideResult('black', game.result) },
        }}
        goTo={[
          { label: 'Play the Master', to: '/play', direction: 'forward' },
          { label: 'Play online', to: '/play-online', direction: 'forward' },
        ]}
        initialPly="start"
        analyticsSurface="shared_game"
        boardLabel={`Chess board, ${game.white.username} against ${game.black.username}, finished`}
        movesMedia={{
          half: false,
          content: (
            <span className="card-row justify-end">
              <GamePgnActions
                pgn={() => game.pgn}
                fileName={gamePgnFileName(game.white.username, game.black.username, playedAt!)}
                mode={mode}
                surface="shared_game"
                shareId={game.id}
              />
            </span>
          ),
        }}
      />
    </>
  );
}
