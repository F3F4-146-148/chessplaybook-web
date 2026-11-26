/**
 * #428 A4: A DEV-ONLY MOCK OF THE GUIDED GAME IN `/play`'s GAME CARD, so the owner can see and approve the look, and
 * the layout can be measured on the window matrix before Phase D builds it for real. Nothing here plays: the buttons
 * do nothing and the texts are the longest approved ones (A3, analysis section 5), the worst case for the fit.
 *
 *   /play?guidedMock=1     the switch row above New game (off); turn it on, then New game: the button row and a Why? answer
 *   /play?guidedMock=warn  as 1, switched on, and during the game a warning with Take back and Play on
 *
 * Only in a development build (`import.meta.env.DEV`): a production build never reads the parameter.
 */
import { useState } from 'react';
import { Play, Undo2, UserRoundCheck } from 'lucide-react';

import { Toggle } from '@/features/puzzles/components/TrainerUI';

export type GuidedMock = 'switch' | 'warn';

export function readGuidedMock(search: string): GuidedMock | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(search).get('guidedMock');
  return v === 'warn' ? 'warn' : v ? 'switch' : null;
}

/** A3, owner-approved wordings. */
export const GUIDED_INVITATION = "I'll help you this time. Ask me anything.";
/** The longest approved warning (46 characters). */
const LONGEST_WARNING = 'Wait. That repeats the position a third time.';
/** A Why? answer past the opening: the approved intro and an explainer action line of the longer kind (an example). */
const LONG_WHY = "Here is what the position asks of you now. Bring the knight to d5 and challenge White's bishop, before White doubles the rooks on the open c-file.";

export function GuidedSwitchRow({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div data-guided="switch">
      <Toggle
        icon={<UserRoundCheck className="shrink-0 text-link" />}
        checked={checked}
        onChange={onChange}
        label="Guided game"
        hint="The Master helps you as you play"
        hintLines={1}
      />
    </div>
  );
}

/** What the area says before anything is asked (draft, for the owner). */
const SPEECH_EMPTY = 'Ask me for a hint, or why I played my move.';
/** A Hint answer of the usual length (an example). */
const SAMPLE_HINT = 'Look at the pieces that are not defended yet, yours and mine.';

/**
 * Under his strip during a guided game: the button row, and the speech block that holds a warning or an answer.
 * The texts are SAMPLES chosen for their length, not about the position on the board (owner, 2026-11-26: a fixed
 * answer on the starting position "doesn't make sense"), so the block says so, and an answer shows only when its
 * button is pressed.
 */
export function GuidedPlayBlock({ warning, sampleWarning, takebacksLeft, onTakeBack, onPlayOn, notice }: {
  /** A real warning (B4): his reply is held until Take back or Play on. */
  warning: { text: string } | null;
  /** `?guidedMock=warn`: a sample warning for the layout while no real one is held. */
  sampleWarning: boolean;
  takebacksLeft: number;
  onTakeBack: () => void;
  onPlayOn: () => void;
  /** A line in place of the empty prompt (B6: another tab holds the engine). */
  notice?: string | null;
}) {
  const [asked, setAsked] = useState<'hint' | 'why' | null>(null);
  const showWarning = warning !== null || sampleWarning;
  const sample = !warning; // Hint and Why? answers are samples until Phase C
  const text = warning ? warning.text : sampleWarning ? LONGEST_WARNING : asked === 'why' ? LONG_WHY : asked === 'hint' ? SAMPLE_HINT : null;
  return (
    <div className="flex min-h-0 flex-[3_1_0%] flex-col" style={{ gap: 'var(--card-air)' }} data-guided="play">
      <div className="flex shrink-0" style={{ gap: 'var(--card-air)' }} data-guided="buttons">
        {showWarning ? (
          <>
            <button type="button" onClick={onTakeBack} className="card-btn card-btn-primary min-w-0 flex-1"><Undo2 className="shrink-0" aria-hidden /><span className="truncate">Take back</span></button>
            <button type="button" onClick={onPlayOn} className="card-btn min-w-0 flex-1 border border-border"><Play className="shrink-0" aria-hidden /><span className="truncate">Play on</span></button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setAsked('hint')} aria-pressed={asked === 'hint'} className="card-btn min-w-0 flex-auto border border-border"><span className="truncate">Hint</span></button>
            <button type="button" onClick={() => setAsked('why')} aria-pressed={asked === 'why'} className="card-btn min-w-0 flex-auto border border-border"><span className="truncate">Why?</span></button>
            <button type="button" onClick={onTakeBack} disabled={takebacksLeft <= 0} className="card-btn min-w-0 flex-auto border border-border disabled:opacity-50"><span className="truncate">Take back · {takebacksLeft}</span></button>
          </>
        )}
      </div>
      {/*
        A FIXED AREA FOR WHAT HE SAYS (owner, 2026-11-26: "the move list below is moving depending on the text
        length"; "more generous": explanations, hints, the opening's reasons). The card's free height is split at a
        constant 3 to 2 between this area and the move list from the first move, whatever it holds, so the list never
        moves; an answer longer than the area scrolls inside it.
      */}
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-[0.6em] bg-muted px-[0.7em] py-[0.4em] text-[0.92em] leading-snug"
        data-guided="speech"
        aria-live="polite"
        tabIndex={0}
        aria-label="What the Master says"
      >
        {text ? (
          <p className="text-foreground">
            {text}{sample && <> <span className="text-[0.8em] uppercase tracking-wide text-muted-foreground">(sample text)</span></>}
          </p>
        ) : (
          <p className="text-muted-foreground">{notice ?? SPEECH_EMPTY}</p>
        )}
      </div>
    </div>
  );
}
