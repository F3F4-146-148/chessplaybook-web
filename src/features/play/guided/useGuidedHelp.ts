/**
 * #428 D3: HINT AND WHY? IN A GUIDED GAME (analysis 3.3, owner rulings 2026-11-25/26).
 *
 *   Hint (D3b, owner 2026-11-26, replacing the explainer's action line, "not very helpful"): the opening trainer's
 *     hints for the best move, one more per press, least pointing first; then the piece to move marked; in an
 *     endgame (no endgame explainer yet, #545) the piece and then SF's move as an arrow.
 *   Why? (his last move):
 *     - in the opening, his move's reviewed reasons with the trainer's marks;
 *     - a weak move of his (it gave the player WEAK_GIFT win% or more): "A natural move, but it gives you a chance.
 *       Can you find it?", with no reason claimed;
 *     - otherwise, "Here is what the position asks of you now." and the action line for the position he left you.
 *
 * Nothing is worked out here beyond the engine's own search (rule R1): the words and their marks are the server's.
 * The fixed lines are voiced (C6); the explainer's lines and the reasons are text only.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { logGA4Event } from '@/services/analytics';
import { fetchGuidedAction, fetchHints, fetchWhy, type GuidedHint, type HintStage } from './guidedApi';
import type { GuidedGame } from './useGuidedGame';

/** His reply gave the player this much win% or more: Why? says so instead of giving it reasons (analysis 3.3). */
export const WEAK_GIFT = 7;

const AUDIO = '/audio/master-guided-v1/';
/** The fixed lines he says here, with their recordings (keys are the server's audioKey, checked by a test). */
export const HELP_LINES = {
  look: { text: 'Let me look...', key: 'df8e35a59c65965a' },
  asks: { text: 'Here is what the position asks of you now.', key: '4e662775192257e0' },
  weak: { text: 'A natural move, but it gives you a chance. Can you find it?', key: 'ce65be2e4782af6a' },
} as const;
export const helpVoice = (l: { text: string; key: string }) => ({ text: l.text, audioUrl: `${AUDIO}${l.key}.mp3`, cuesUrl: `${AUDIO}${l.key}.json` });

export interface HelpAnswer {
  kind: 'hint' | 'why';
  /** The lines shown in his speech area, in order. */
  lines: string[];
  /** The line he says aloud, if it is one of his recorded ones. */
  voice: { text: string; audioUrl: string; cuesUrl?: string } | null;
  /** Why? in the opening: his reasons, each with its own marks; one is marked at a time (Fable: all at once lit 16 squares). */
  items?: Array<{ key?: string; text: string; marks?: string }>;
  selected?: number;
  /** Board marks in the trainer's format, and whose they are (the plain marks' colour). */
  marks: string;
  mover: 'white' | 'black';
}

export interface GuidedHelp {
  answer: HelpAnswer | null;
  /** True while an answer is being fetched (his "Let me look..." shows meanwhile). */
  busy: boolean;
  /** The last line he said aloud for this position (kept, so his voice does not fall back to an older line). */
  voice: HelpAnswer['voice'];
  /** D3b: Hint has more to give for this position (the trainer's "Another hint", off when there is none). */
  moreHints: boolean;
  /** Hints used this game, rung by rung (D4's summary). */
  hintsUsed: number;
  hint: () => void;
  why: () => void;
  /** Why? in the opening: mark the reason pressed. */
  select: (i: number) => void;
}

export function useGuidedHelp({ guided, enabled, fen, moves, playerColor, playersTurn, newGame }: {
  guided: Pick<GuidedGame, 'gameId' | 'searchHere' | 'hisMoveGift' | 'warning' | 'hintsUsed' | 'noteHint'>;
  enabled: boolean;
  fen: string;
  /** The game's moves in UCI (the store's). */
  moves: string[];
  playerColor: 'white' | 'black';
  /** It is the player's move and nothing is held. */
  playersTurn: boolean;
  /** The game status: the hint count starts again when it becomes "playing" (D4: not at the end). */
  newGame: unknown;
}): GuidedHelp {
  const him = playerColor === 'white' ? 'black' : 'white';
  const [answer, setAnswer] = useState<HelpAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<HelpAnswer['voice']>(null);
  const show = useCallback((a: HelpAnswer | null) => { setAnswer(a); if (a?.voice) setVoice(a.voice); }, []);
  const [moreHints, setMoreHints] = useState(true);
  /* The rung reached for the position on the board; a new position starts again. */
  const rungRef = useRef(0);
  /* Each request belongs to one position: an answer for a position that is gone is dropped. */
  const askRef = useRef(0);
  /* D3b: the hint ladder for the position on the board, fetched at the first press. */
  const ladderRef = useRef<{ best: string; hints: GuidedHint[]; stage: HintStage | null } | null>(null);

  const plies = moves.length;
  useEffect(() => { rungRef.current = 0; ladderRef.current = null; setMoreHints(true); askRef.current++; setAnswer(null); setVoice(null); setBusy(false); }, [plies, fen]);
  useEffect(() => { if (guided.warning) { askRef.current++; setAnswer(null); setVoice(null); setBusy(false); } }, [guided.warning]);

  const movesRef = useRef(moves);
  movesRef.current = moves;

  /*
    D3b (owner, 2026-11-26): HINT IS THE OPENING TRAINER'S HINTS for the best move, one more per press, least pointing
    first; then the piece to move, marked in the idea's gold; in an endgame, where the endgame explainer (#545) does not
    exist yet, the piece and then SF's move itself as an arrow. Before the server knows the game (the first move not yet
    played) there are no hints: the piece first.
  */
  const hint = useCallback(() => {
    if (!enabled || !playersTurn || busy) return;
    const ask = ++askRef.current;
    const id = guided.gameId;
    const line = [...movesRef.current];
    /*
      The presses (owner, 2026-11-26: one hint per press was not obvious, "print all hints at once"): all the hints,
      then the piece; with no hints (an endgame, or before the server knows the game) the piece first; in an endgame
      SF's move last.
    */
    const step = (ladder: { best: string; hints: GuidedHint[]; stage: HintStage | null }) => {
      const steps: Array<'hints' | 'piece' | 'move'> = [
        ...(ladder.hints.length ? ['hints' as const] : []), 'piece', ...(ladder.stage === 'endgame' ? ['move' as const] : []),
      ];
      const i = rungRef.current;
      if (i >= steps.length) return;
      rungRef.current = i + 1;
      setMoreHints(i + 1 < steps.length);
      guided.noteHint(); // E2: counted with the game, so a reload keeps it
      logGA4Event({ name: 'guided_hint', params: { kind: steps[i] } });
      const marks = steps[i] === 'hints' ? '' : steps[i] === 'piece' ? `*${ladder.best.slice(0, 2)}` : ladder.best.slice(0, 4);
      show({ kind: 'hint', lines: ladder.hints.map((x) => x.text), items: ladder.hints, voice: null, marks, mover: playerColor });
    };
    if (ladderRef.current) { step(ladderRef.current); return; }
    setBusy(true);
    (async () => {
      const s = await guided.searchHere(fen);
      if (ask !== askRef.current) return;
      const best = s?.best;
      if (!best) { setBusy(false); return; }
      const got = id ? await fetchHints(id, line, best) : null;
      if (ask !== askRef.current) return;
      setBusy(false);
      const ladder = { best, hints: got?.hints ?? [], stage: got?.stage ?? null };
      // E2 (Fable): a failed answer (the server unreachable, the game's calls used) is not kept as "no hints" here,
      // and Hint stays pressable to ask again (round 2: the piece was shown and the button greyed out)
      if (got || !id) { ladderRef.current = ladder; step(ladder); return; }
      step(ladder);
      rungRef.current = 0;
      setMoreHints(true);
    })();
  }, [enabled, playersTurn, busy, guided, fen, playerColor, show]);

  const why = useCallback(() => {
    const id = guided.gameId;
    if (!enabled || !playersTurn || busy || !id) return;
    const ask = ++askRef.current;
    const line = [...movesRef.current];
    setBusy(true);
    show({ kind: 'why', lines: [HELP_LINES.look.text], voice: helpVoice(HELP_LINES.look), marks: '', mover: him });
    /*
      D3b (owner, 2026-11-26): the trainer's reasons for his move at every stage but the endgame. A weak move of his is
      said as such FIRST: past the opening it would otherwise get reasons that praise a move that gives you a chance.
    */
    (async () => {
      const gift = await guided.hisMoveGift(fen, line.length);
      if (ask !== askRef.current) return;
      if (gift !== null && gift >= WEAK_GIFT) {
        setBusy(false);
        show({ kind: 'why', lines: [HELP_LINES.weak.text], voice: helpVoice(HELP_LINES.weak), marks: '', mover: him });
        logGA4Event({ name: 'guided_why', params: { kind: 'weak' } });
        return;
      }
      const reasons = await fetchWhy(id, line);
      if (ask !== askRef.current) return;
      if (reasons && reasons.length) {
        setBusy(false);
        show({ kind: 'why', lines: reasons.map((r) => r.text), items: reasons, selected: 0, voice: null, marks: reasons[0].marks, mover: him });
        logGA4Event({ name: 'guided_why', params: { kind: 'reasons' } });
        return;
      }
      // An endgame (#545), or no reason found: what the position asks of the player now, from the explainer.
      const a = await fetchGuidedAction(id, fen, line);
      if (ask !== askRef.current) return;
      setBusy(false);
      show(a
        ? { kind: 'why', lines: [HELP_LINES.asks.text, a.action], voice: helpVoice(HELP_LINES.asks), marks: a.marks, mover: playerColor }
        : null);
      logGA4Event({ name: 'guided_why', params: { kind: a ? 'position' : 'none' } });
    })();
  }, [enabled, playersTurn, busy, guided, fen, him, playerColor, show]);

  const select = useCallback((i: number) => {
    setAnswer((a) => (a?.items?.[i] ? { ...a, selected: i, marks: a.items[i].marks ?? '' } : a));
  }, []);

  return { answer, busy, voice, moreHints, hintsUsed: guided.hintsUsed, hint, why, select };
}
