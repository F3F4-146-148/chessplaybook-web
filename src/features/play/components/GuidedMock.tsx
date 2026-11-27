/**
 * #428 A4: A DEV-ONLY MOCK OF THE GUIDED GAME IN `/play`'s GAME CARD, so the owner can see and approve the look, and
 * the layout can be measured on the window matrix before Phase D builds it for real. Since D2-D3 the switch row and the
 * play block are the real ones (the file keeps its name); only `?guidedMock=warn`'s sample warning is a sample.
 *
 *   /play?guidedMock=1     the switch row above New game (off); turn it on, then New game: the button row and a Why? answer
 *   /play?guidedMock=warn  as 1, switched on, and during the game a warning with Take back and Play on
 *
 * Only in a development build (`import.meta.env.DEV`): a production build never reads the parameter.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Lightbulb, Play, Undo2, UserRoundCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Toggle } from '@/features/puzzles/components/TrainerUI';
import { ReasonList } from '@/features/openings/components/ReasonList';
import { WELCOME_GOALS, type WelcomeGoal } from '@/features/openings/welcome';
import type { SummaryMistake, WorkOn } from '../guided/useGuidedSummary';
import { openDailyLimitDialog, whenBack, type DailyLimit } from '@/services/freePlanLimit';
import { logGA4Event } from '@/services/analytics';

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

/**
 * D6 (owner-approved wording, 2026-11-26): once today's free guided game is used, the line says when the next one is,
 * and a tap on it opens the limit dialog again (what is used, when it is back, Premium).
 */
export function GuidedLimitLine({ limit }: { limit: DailyLimit }) {
  return (
    <button
      type="button"
      onClick={() => openDailyLimitDialog(limit)}
      className="text-left underline decoration-muted-foreground/50 underline-offset-2 hover:text-foreground hover:decoration-foreground"
      data-guided="limit-line"
    >
      You can play another free guided game {whenBack(limit.resetsAt)}.
    </button>
  );
}

export function GuidedSwitchRow({ checked, onChange, limit = null }: { checked: boolean; onChange: (next: boolean) => void; limit?: DailyLimit | null }) {
  return (
    <div data-guided="switch">
      <Toggle
        icon={<UserRoundCheck className="shrink-0 text-link" />}
        checked={checked}
        onChange={onChange}
        label="Guided game"
        hint={limit ? <GuidedLimitLine limit={limit} /> : 'The Master helps you as you play'}
        hintLines={1}
      />
    </div>
  );
}

/** The guided buttons' height: two lines (the word and what it is for), for both rows (card-btn is one line, 2.2). */
const TWO_LINE = { height: 'calc(var(--card-type) * 2.9)' } as const;

/** What the area says before anything is asked (owner-approved, 2026-11-26, after Fable's and Codex's reviews). */
export const SPEECH_EMPTY = 'Ask me for a hint, or ask why I played my last move.';
/** Before his first move there is no move of his to ask about, so Why? waits. */
export const SPEECH_EMPTY_FIRST = 'Ask me for a hint.';
/**
 * Under his strip during a guided game: the button row, and the speech block that holds a warning, an answer to
 * Hint or Why? (D3), or a missed chance after his reply (D2). Only `?guidedMock=warn` shows a SAMPLE warning, for
 * the layout, and says so.
 */
export function GuidedPlayBlock({ warning, sampleWarning, said = null, answer = null, busy = false, moreHints = true, onHint, onWhy, onSelect, canAskWhy = true, takebacksLeft, onTakeBack, onPlayOn, notice, principles = false }: {
  /** A real warning (B4): his reply is held until Take back or Play on. */
  warning: { text: string } | null;
  /** `?guidedMock=warn`: a sample warning for the layout while no real one is held. */
  sampleWarning: boolean;
  /** D2: a missed chance he says after his reply ("You could have won my rook on e5 last move."). */
  said?: { text: string } | null;
  /** D3: the answer to Hint or Why?, line by line. */
  answer?: { kind: 'hint' | 'why'; lines: string[]; items?: Array<{ key?: string; text: string }>; selected?: number } | null;
  /** Why? in the opening: the reason pressed is the one marked on the board. */
  onSelect?: (i: number) => void;
  /** D3: an answer is on its way (the buttons wait). */
  busy?: boolean;
  /** D3b: Hint has more to give (owner: the button always says "Hint"); off when it has none. */
  moreHints?: boolean;
  onHint?: () => void;
  onWhy?: () => void;
  /** False before his first move (Why? has nothing to answer yet). */
  canAskWhy?: boolean;
  takebacksLeft: number;
  onTakeBack: () => void;
  onPlayOn: () => void;
  /** A line in place of the empty prompt (B6: another tab holds the engine). */
  notice?: string | null;
  /** D3c: the game is still in the opening (SF), so the opening-principles tab is offered. */
  principles?: boolean;
}) {
  const showWarning = warning !== null || sampleWarning;
  /* A warning first; then an answer asked for; then a missed chance. */
  const lines = warning ? [warning.text] : sampleWarning ? [LONGEST_WARNING] : answer ? answer.lines : said ? [said.text] : null;
  const sample = !warning && sampleWarning;
  /*
    D3c (owner, 2026-11-26): THE OPENING PRINCIPLES AS A TAB of this area while the game is in the opening: the
    trainer's six goals, as text (owner: no examples here, the board is the game). Anything he says (a warning, an
    answer, a missed chance) brings his tab back, so nothing he says is hidden behind the principles.
  */
  const [tab, setTab] = useState<'master' | 'principles'>('master');
  useEffect(() => { if (warning || sampleWarning || answer || said) setTab('master'); }, [warning, sampleWarning, answer, said]);
  const showPrinciples = principles && tab === 'principles';
  /*
    E2 (Codex, Fable): THE TABS AS A TABLIST: one tab stop (the selected tab), the arrow keys, Home and End move
    between them and select; the panel is labelled by its tab.
  */
  const TABS = [['master', 'The Master'], ['principles', 'Opening principles']] as const;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const choose = (id: 'master' | 'principles') => {
    if (id === 'principles' && tab !== 'principles') logGA4Event({ name: 'guided_principles_opened', params: {} });
    setTab(id);
  };
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = TABS.length;
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    choose(TABS[to][0]);
    tabRefs.current[to]?.focus();
  };
  /* E2 (Fable): when a warning ends, its Take back button is gone: focus goes to the area, not to the page's body. */
  const areaRef = useRef<HTMLDivElement>(null);
  const hadWarningRef = useRef(false);
  useEffect(() => {
    const had = hadWarningRef.current;
    hadWarningRef.current = warning !== null;
    if (had && !warning && (document.activeElement === document.body || document.activeElement === null)) areaRef.current?.focus();
  }, [warning]);
  /*
    D2 (analysis 3.8): a warning moves focus to Take back, and Escape is Play on. The board and the page keep their
    own keys otherwise: the listener is there only while a real warning is held.
  */
  const takeBackRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!warning) return;
    takeBackRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onPlayOn(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [warning, onPlayOn]);
  return (
    <div className="flex min-h-0 flex-[3_1_0%] flex-col" style={{ gap: 'var(--card-air)' }} data-guided="play">
      {/*
        TWO-LINE BUTTONS (owner, 2026-11-26: "Why is not really describing what it does"): the word, and under it what
        it is for, smaller. Equal widths, so every small line fits (measured: by content, Hint was 48px at 800x600 and
        "for your move" needs 57; equal, about 68). One height for both rows, so the speech area never moves when a
        warning puts Take back and Play on in their place.
      */}
      <div className="flex shrink-0" style={{ gap: 'var(--card-air)' }} data-guided="buttons">
        {showWarning ? (
          <>
            <button ref={takeBackRef} type="button" onClick={onTakeBack} className="card-btn card-btn-primary min-w-0 flex-1" style={TWO_LINE}><Undo2 className="shrink-0" aria-hidden /><span className="truncate">Take back</span></button>
            <button type="button" onClick={onPlayOn} className="card-btn min-w-0 flex-1 border border-border" style={TWO_LINE}><Play className="shrink-0" aria-hidden /><span className="truncate">Play on</span></button>
          </>
        ) : (
          <>
            <button type="button" onClick={onHint} disabled={busy || (answer?.kind === 'hint' && !moreHints)} className="card-btn min-w-0 flex-1 basis-0 flex-col !gap-0 border border-border disabled:opacity-50" style={TWO_LINE}>
              <span className="truncate leading-tight">Hint</span><span className="max-w-full truncate text-[0.72em] leading-tight text-muted-foreground">for your move</span>
            </button>
            <button type="button" onClick={onWhy} disabled={busy || !canAskWhy} aria-pressed={answer?.kind === 'why'} className="card-btn min-w-0 flex-1 basis-0 flex-col !gap-0 border border-border disabled:opacity-50" style={TWO_LINE}>
              <span className="truncate leading-tight">Why?</span><span className="max-w-full truncate text-[0.72em] leading-tight text-muted-foreground">his last move</span>
            </button>
            <button type="button" onClick={onTakeBack} disabled={takebacksLeft <= 0} className="card-btn min-w-0 flex-1 basis-0 flex-col !gap-0 border border-border disabled:opacity-50" style={TWO_LINE}>
              <span className="truncate leading-tight">Take back</span><span className="max-w-full truncate text-[0.72em] leading-tight text-muted-foreground">{takebacksLeft} left</span>
            </button>
          </>
        )}
      </div>
      {/*
        A FIXED AREA FOR WHAT HE SAYS (owner, 2026-11-26: "the move list below is moving depending on the text
        length"; "more generous": explanations, hints, the opening's reasons). The card's free height is split at a
        constant 3 to 2 between this area and the move list from the first move, whatever it holds, so the list never
        moves; an answer longer than the area scrolls inside it.
      */}
      {principles && (
        <div className="flex shrink-0" style={{ gap: 'var(--card-air)' }} role="tablist" aria-label="What this area shows" data-guided="tabs">
          {TABS.map(([id, label], i) => (
            <button
              key={id}
              ref={(el) => { tabRefs.current[i] = el; }}
              id={`guided-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls="guided-speech"
              tabIndex={tab === id ? 0 : -1}
              onClick={() => choose(id)}
              onKeyDown={(e) => onTabKey(e, i)}
              /* widths by their words (measured: equal widths cut "Opening principles" by 4px at 800x600) */
              className={`card-btn min-w-0 flex-auto border ${tab === id ? 'border-link bg-muted text-foreground' : 'border-border text-muted-foreground'}`}
              style={{ height: 'calc(var(--card-type) * 1.9)' }}
            >
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      )}
      <div
        ref={areaRef}
        id="guided-speech"
        className="min-h-0 flex-1 overflow-y-auto rounded-[0.6em] bg-muted px-[0.7em] py-[0.4em] text-[0.92em] leading-snug"
        data-guided="speech"
        role={principles ? 'tabpanel' : undefined}
        aria-live={showPrinciples ? undefined : 'polite'}
        tabIndex={0}
        aria-labelledby={principles ? `guided-tab-${tab}` : undefined}
        aria-label={principles ? undefined : 'What the Master says'}
      >
        {showPrinciples ? (
          <div data-guided="principles">
            <ReasonList reasons={WELCOME_GOALS as WelcomeGoal[]} empty="" />
          </div>
        ) : !warning && !sampleWarning && answer?.kind === 'hint' && answer.lines.length > 0 ? (
          /*
            D3b: the hints as the opening trainer shows them (owner, 2026-11-26): "Hints" over them (no accent edge: owner, it
            "doesn't look good" here), and each
            line as the trainer's reasons are (#177): the marker of its reason's kind, a thin divider, the first heavier.
          */
          <div className="flex flex-col gap-[0.35em] rounded-md bg-background/40 px-[0.8em] py-[0.5em]" data-guided="hints">
            <span className="inline-flex items-center gap-[0.4em] font-semibold text-link">
              <Lightbulb aria-hidden />
              {answer.lines.length > 1 ? 'Hints' : 'Hint'}
            </span>
            <ReasonList reasons={answer.items ?? answer.lines.map((text) => ({ text }))} empty="" />
          </div>
        ) : !warning && !sampleWarning && answer?.items ? (
          /* His reasons in the opening, as the trainer lists them (#177); a press marks that reason's squares (#324). */
          <div aria-label="Why I played my move">
            <ReasonList reasons={answer.items} empty="" active={answer.selected ?? 0} onSelect={onSelect} />
          </div>
        ) : lines ? (
          <div className="flex flex-col" style={{ gap: '0.35em' }}>
            {lines.map((l, i) => (
              <p key={i} className="text-foreground">
                {l}{sample && <> <span className="text-[0.8em] uppercase tracking-wide text-muted-foreground">(sample text)</span></>}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">{notice ?? (canAskWhy ? SPEECH_EMPTY : SPEECH_EMPTY_FIRST)}</p>
        )}
      </div>
    </div>
  );
}

/**
 * D4 (analysis 3.5): HIS SUMMARY WHEN A GUIDED GAME ENDS, in the place of the buttons and the speech area, so the move
 * list keeps its place: the two biggest mistakes among the moves that stand (a press shows the position after it),
 * the counts, one thing to work on, and, when moves were taken back, that they are not counted. Words to be approved.
 */
export function GuidedSummary({ mistakes, hints, takebacks, warnings, workOn, onGoTo }: {
  mistakes: SummaryMistake[];
  hints: number;
  takebacks: number;
  warnings: number;
  workOn: WorkOn | null;
  /** Show the position after the move at `ply` (1 = the first move). */
  onGoTo: (ply: number) => void;
}) {
  return (
    <div className="flex min-h-0 flex-[3_1_0%] flex-col" data-guided="summary">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[0.6em] bg-muted px-[0.7em] py-[0.5em] text-[0.92em] leading-snug" tabIndex={0} aria-label="How the game went">
        <div className="flex flex-col" style={{ gap: '0.55em' }}>
          <span className="text-[0.8em] uppercase tracking-wide text-muted-foreground">{mistakes.length > 1 ? 'Your biggest mistakes' : 'Your biggest mistake'}</span>
          {mistakes.length === 0 ? (
            <p className="text-foreground">No big mistakes in the moves you kept.</p>
          ) : (
            <ul className="flex flex-col" data-guided="mistakes">
              {mistakes.map((m) => (
                <li key={m.ply} className="border-t border-border first:border-t-0">
                  <button type="button" onClick={() => onGoTo(m.ply)} className="flex w-full items-baseline gap-[0.5em] rounded-[0.35em] px-[0.3em] py-[0.35em] text-left hover:bg-background/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                    <span className="shrink-0 font-semibold text-foreground">{m.played}</span>
                    {m.better && <span className="min-w-0 text-muted-foreground">{m.better} was better</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground" data-guided="counts">
            Hints {hints} · Take backs {takebacks} · Warnings {warnings}
          </p>
          {workOn && (
            <Link to={workOn.href} onClick={() => logGA4Event({ name: 'guided_work_on_clicked', params: { to: workOn.href } })} className="inline-flex items-center gap-[0.35em] font-medium text-link hover:underline" data-guided="work-on">
              Work on next: {workOn.label}
              <ArrowRight className="h-[1em] w-[1em] shrink-0" aria-hidden />
            </Link>
          )}
          {takebacks > 0 && <p className="text-[0.86em] text-muted-foreground">Moves you took back are not counted.</p>}
        </div>
      </div>
    </div>
  );
}
