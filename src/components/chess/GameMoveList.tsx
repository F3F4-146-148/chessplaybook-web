import { useRef, useEffect, type KeyboardEvent } from 'react';
import { announceMove, pliesBefore } from '@/lib/game/moveSpeech';

interface GameMoveListProps {
  /** Array of SAN moves ["e4", "e5", "Nf3", ...] */
  moves: string[];
  /** Index of the currently displayed move (0-based, -1 for start) */
  currentMoveIndex?: number;
  /**
   * Go to a move (0-based, -1 for the starting position). Without it the moves are
   * text, not controls: a page passes it only while the reader may step (on
   * `/play-online`, in a game).
   */
  onMoveClick?: (moveIndex: number) => void;
  /** Additional CSS class */
  className?: string;
  /**
   * Whether the list is its own scroller (the default, for the pre-Workspace
   * pages). On a Workspace page pass `false` and put it in a `WorkspaceList`:
   * inside a card only that may scroll (spec §5, contract §9.1), and the list
   * then follows the current move in the `WorkspaceList` instead (Dg).
   */
  scrolls?: boolean;
  /**
   * The position the game starts from, when it is not the initial one (a `[FEN]`
   * tag): the moves are numbered from its move number, and a game starting with
   * Black to move opens on "40. ... Kd7".
   */
  startFen?: string;
  /**
   * The game's result once it is over, as a score sheet records it ("1-0", "0-1",
   * "1/2-1/2", written as is). It sits on its own line below the last
   * move, centred under the two columns of moves (owner, 2026-11-19, #360). The
   * result only, no reason (owner).
   */
  result?: '1-0' | '0-1' | '1/2-1/2';
}

/* What a screen reader says for the score, which reads poorly as figures. */
const RESULT_WORDS = { '1-0': 'White won', '0-1': 'Black won', '1/2-1/2': 'draw' } as const;

/**
 * A game's moves in two-column notation, the one move list for every board page
 * (layout redesign E2, 2026-10-10; grew from `MoveList`).
 *
 * - The current move is marked, and kept in view inside the list's own box.
 * - A move is a button: click it, or reach it with Tab (one stop, on the current
 *   move) and step with the arrow keys: Left/Right one move, Up/Down a full move,
 *   Home/End to the start and the end. Focus follows the move.
 * - A polite live region says the move whenever the board shows another one, in
 *   the Lichess viewer's wording (owner, 2026-10-10), so a screen-reader user hears
 *   each step and each new move without leaving the board.
 */
export function GameMoveList({
  moves,
  currentMoveIndex = moves.length - 1,
  onMoveClick,
  className = '',
  scrolls = true,
  startFen,
  result,
}: GameMoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeMoveRef = useRef<HTMLElement | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const last = moves.length - 1;
  const current = Math.min(currentMoveIndex, last);

  /*
    Auto-scroll to the current move within the container only (never scroll the page). At the last move
    of a finished game the target is the result line below it, so the result is in view too (#360: on a
    phone it sat under the list's edge). It runs again when the box changes height: a card's rows can
    settle after the first paint (the Game report row on /play-online, #359), and a move kept in view
    by the first run can end up under the edge.
  */
  useEffect(() => {
    /* The box that scrolls: this list, or the `WorkspaceList` it sits in. */
    const container = scrolls
      ? scrollRef.current
      : scrollRef.current?.closest<HTMLElement>('[data-workspace-list]') ?? null;
    if (!container) return;
    const keepInView = () => {
      const target = current === last && resultRef.current ? resultRef.current : activeMoveRef.current;
      if (!target) return;
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      // Only scroll if the target is outside the visible area of the container
      if (targetRect.bottom > containerRect.bottom) {
        container.scrollTop += targetRect.bottom - containerRect.bottom + 4;
      } else if (targetRect.top < containerRect.top) {
        container.scrollTop -= containerRect.top - targetRect.top + 4;
      }
    };
    keepInView();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(keepInView);
    observer.observe(container);
    return () => observer.disconnect();
  }, [current, last, scrolls, result]);

  /*
    FOCUS FOLLOWS THE MOVE, but only when it is already in the list: stepping with
    the keys moves the tab stop to the new current move, while a step made anywhere
    else (the toolbar, the wheel, a new move arriving) never pulls focus here.
  */
  useEffect(() => {
    const list = scrollRef.current;
    if (!list || !list.contains(document.activeElement)) return;
    if (activeMoveRef.current && activeMoveRef.current !== document.activeElement) {
      activeMoveRef.current.focus({ preventScroll: true });
    }
  }, [current]);

  /*
    THE KEYS STOP HERE. A page may also listen for Left/Right on the window
    (`useBoardStepInput`); stopping the event keeps one key press one step.
  */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onMoveClick || e.altKey || e.ctrlKey || e.metaKey) return;
    const to: Record<string, number> = {
      ArrowLeft: current - 1, ArrowRight: current + 1,
      ArrowUp: current - 2, ArrowDown: current + 2,
      Home: -1, End: last,
    };
    if (!(e.key in to)) return;
    e.preventDefault();
    e.stopPropagation();
    const target = Math.max(-1, Math.min(last, to[e.key]));
    if (target !== current) onMoveClick(target);
  };

  /*
    Group the moves into rows by move number (1. e4 e5, 2. Nf3 Nc6, ...). Index i is
    ply `firstPly + i` of the game, so a game from a FEN starts at its own number,
    and one starting with Black to move has no White move in its first row.
  */
  const firstPly = pliesBefore(startFen);
  const movePairs: Array<{ number: number; white?: number; black?: number }> = [];
  moves.forEach((_, i) => {
    const ply = firstPly + i;
    const number = Math.floor(ply / 2) + 1;
    let row = movePairs[movePairs.length - 1];
    if (!row || row.number !== number) {
      row = { number };
      movePairs.push(row);
    }
    if (ply % 2 === 0) row.white = i;
    else row.black = i;
  });

  /* One tab stop: the current move, or the first move at the starting position. */
  const tabStop = current >= 0 ? current : 0;

  const renderMove = (san: string, index: number, extra: string) => {
    const isCurrent = current === index;
    const look = `px-1 rounded ${extra} ${isCurrent ? 'bg-accent text-accent-foreground font-bold' : ''}`;
    if (!onMoveClick) {
      return (
        <span ref={isCurrent ? (el => { activeMoveRef.current = el; }) : undefined} className={look}
          aria-current={isCurrent ? 'step' : undefined}>
          {san}
        </span>
      );
    }
    return (
      <button
        type="button"
        ref={isCurrent ? (el => { activeMoveRef.current = el; }) : undefined}
        className={`${look} cursor-pointer text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        aria-current={isCurrent ? 'step' : undefined}
        tabIndex={index === tabStop ? 0 : -1}
        onClick={() => onMoveClick(index)}
      >
        {san}
      </button>
    );
  };

  return (
    <>
      <div
        ref={scrollRef}
        className={`${scrolls ? 'overflow-y-auto ' : ''}${result ? 'grid grid-cols-[max-content] ' : ''}text-sm font-mono ${className}`}
        onKeyDown={onKeyDown}
      >
        {movePairs.map((pair) => (
          <div key={pair.number} className="flex items-baseline gap-1 py-0.5">
            <span className="text-muted-foreground w-8 text-right shrink-0">
              {pair.number}.
            </span>
            {pair.white !== undefined
              ? renderMove(moves[pair.white], pair.white, 'w-14 shrink-0')
              : <span className="w-14 shrink-0 px-1 text-muted-foreground" aria-hidden>...</span>}
            {pair.black !== undefined && renderMove(moves[pair.black], pair.black, '')}
          </div>
        ))}
        {/*
          CENTRED UNDER THE MOVES AS DRAWN (owner, 2026-11-19). With a result the list is a one-column grid
          as wide as its widest row, so every row, this one included, takes that width. Its cell then runs
          from the left of White's column to the right of the widest move, both with the moves' own 4px
          padding, and the score centres in it. Centring on the boundary between the columns (the first
          version) put it 12px right: a short move like "d4" fills only the left of its column.
        */}
        {result && (
          <div ref={resultRef} className="flex items-baseline gap-1 py-0.5" data-move-result aria-label={`Result: ${RESULT_WORDS[result]}`}>
            <span className="w-8 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 text-center font-bold text-foreground" aria-hidden>
              {result}
            </span>
          </div>
        )}
        {moves.length === 0 && (
          <div className="text-muted-foreground italic py-2">No moves yet</div>
        )}
      </div>
      {/* Beside the list, not in it: a guard counts the list's children as its rows. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announceMove(moves, current, firstPly)}
      </div>
    </>
  );
}

export default GameMoveList;
