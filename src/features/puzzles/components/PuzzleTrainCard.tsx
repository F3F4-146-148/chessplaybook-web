import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, ListChecks, Play, Shapes, Signal, SlidersHorizontal } from 'lucide-react';
import { TrainRowPicker } from './TrainRowPicker';
import { Chip, SELECTION_LABEL, AREA_LABEL } from './PuzzleRunSetupCard';
import { PUZZLE_THEMES, RATING_PRESETS } from '../hooks/usePuzzleSettings';
import type { SelectionOption, SessionArea, SessionSelection } from '../services/PuzzleSessionApi';
import { logGA4Event } from '@/services/analytics';

/**
 * "WHAT TO TRAIN" (#521 B2, the new arrangement's half): the run setup and plan cards in one card, with theme and
 * strength brought out of the settings card, where almost nobody found them.
 *
 * ONE SETTING, ONE ROW (owner, 2026-11-26, option A): Theme and Strength are each a row showing their value, a tap
 * opens one short list under it (`TrainRowPicker`); the run is one button with its length as the run card's own
 * chips; "Run" opens Mode and Area. Nothing takes over the card: the full run setup card shows here only while a run
 * is going or with a finished run's result, as it does on today's page. "Mode" and "Area" replace "What to train"
 * and "Where from" (owner): the card's title already says what to train.
 *
 * The same pieces as today's page: the row grammar, the run card's chips and start-button treatment, the page's one
 * selection look in the lists.
 */
export interface PuzzleTrainCardProps {
  theme: string;
  onThemeChange: (v: string) => void;
  filterMode: 'auto' | 'manual';
  onFilterModeChange: (v: 'auto' | 'manual') => void;
  ratingRange: { min: number; max: number };
  onRatingRangeChange: (v: { min: number; max: number }) => void;
  bandIsFarFromRating?: boolean;
  /** The run's choices (the run setup's own state). */
  options: SelectionOption[] | null | undefined;
  areas: readonly string[] | null | undefined;
  selection: SessionSelection;
  onSelectionChange: (v: SessionSelection) => void;
  area: SessionArea | null;
  onAreaChange: (v: SessionArea | null) => void;
  total: number;
  onTotalChange: (v: number) => void;
  onStartRun: () => void;
  /** #521: today's free puzzles are used up, so no run starts: the label instead ("Back tomorrow"), disabled. */
  startBlocked?: string | null;
  /** #559: what the Start button does while `startBlocked` (the Premium page): it is never a dead button. */
  onBlockedPress?: () => void;
  busy?: boolean;
  loading?: boolean;
  /** A run is going: the full run setup shows its progress. */
  runOnScreen: boolean;
  /** A run has just ended: the full run setup shows its result until the player closes it. */
  runFinished: boolean;
  /** The full run setup, `PuzzleRunSetupCard`. */
  runSetup: (onClose: (() => void) | undefined) => ReactNode;
  hasPlan: boolean;
  /** #418 v3 C1: today's rating in the card's leftover space (`TodayGraph`); draws nothing where it does not fit. */
  today?: ReactNode;
}

const LENGTHS = [5, 10, 20];
const AUTO = 'auto';

const changed = (kind: 'theme' | 'strength' | 'mode' | 'area' | 'length', value: string) =>
  logGA4Event({ name: 'puzzle_filter_changed', params: { kind, value, surface: 'train' } });
const opened = () => logGA4Event({ name: 'puzzle_filter_opened', params: { surface: 'train' } });

export function PuzzleTrainCard({
  theme, onThemeChange, filterMode, onFilterModeChange, ratingRange, onRatingRangeChange, bandIsFarFromRating = false,
  options, areas, selection, onSelectionChange, area, onAreaChange, total, onTotalChange,
  onStartRun, startBlocked = null, onBlockedPress, busy = false, loading = false, runOnScreen, runFinished, runSetup, hasPlan, today,
}: PuzzleTrainCardProps) {
  /* A finished run's result stays until it is closed; a new finish shows again. */
  const [resultClosed, setResultClosed] = useState(false);
  useEffect(() => { if (!runFinished) setResultClosed(false); }, [runFinished]);

  if (runOnScreen || (runFinished && !resultClosed)) {
    /* Never closable while a run is going: the card reports the run it is running. */
    return <>{runSetup(runOnScreen ? undefined : () => setResultClosed(true))}</>;
  }

  const strengthValue = filterMode === 'auto'
    ? AUTO
    : RATING_PRESETS.find(p => p.min === ratingRange.min && p.max === ratingRange.max)?.label ?? AUTO;
  /* "Auto", not "Your level": the run's mode is called Your level, and one word for two settings on one card
     reads as one setting. */
  const strengthLabel = strengthValue === AUTO ? 'Auto' : strengthValue;
  const themeLabel = theme ? (PUZZLE_THEMES.find(t => t.value === theme)?.label ?? theme) : 'Mixed';

  /* Until the server's modes land every mode is a disabled placeholder, as on the run setup card. */
  const modes = options?.length ? options : Object.keys(SELECTION_LABEL).map(id => ({ id, available: false }));
  const awaitingOptions = !options?.length;
  const areaChosenForYou = selection === 'weak_areas';
  const shownAreas = areas?.length ? areas : Object.keys(AREA_LABEL);
  const runSummary = `${SELECTION_LABEL[selection] ?? selection} · ${areaChosenForYou ? 'chosen for you' : area ? (AREA_LABEL[area] ?? area) : 'all areas'}`;

  return (
    <>
      <span className="card-label inline-flex items-center gap-[0.35em]">
        <ListChecks />
        What to train
      </span>
      <div className="card-body">
        <TrainRowPicker
          icon={<Shapes className="w-[1em] h-[1em]" />}
          label="Theme"
          value={themeLabel}
          testId="train-theme"
          onOpen={opened}
          groups={[{
            options: PUZZLE_THEMES.map(t => ({ value: t.value, label: t.value ? t.label : 'Mixed (all themes)' })),
            value: theme,
            onChange: (v: string) => { changed('theme', v || 'all'); onThemeChange(v); },
          }]}
        />
        <TrainRowPicker
          icon={<Signal className="w-[1em] h-[1em]" />}
          label="Strength"
          value={strengthLabel}
          testId="train-strength"
          onOpen={opened}
          groups={[{
            options: [{ value: AUTO, label: 'Auto (matched to your record)' }, ...RATING_PRESETS.map(p => ({ value: p.label, label: `${p.label} (${p.min}-${p.max})` }))],
            value: strengthValue,
            onChange: (v: string) => {
              changed('strength', v);
              if (v === AUTO) { onFilterModeChange('auto'); return; }
              const preset = RATING_PRESETS.find(p => p.label === v);
              if (!preset) return;
              onFilterModeChange('manual');
              onRatingRangeChange({ min: preset.min, max: preset.max });
            },
          }]}
          footer={bandIsFarFromRating ? (
            <p className="text-xs text-muted-foreground">This band is far from your rating, so these solves will not move it.</p>
          ) : undefined}
        />
        <div data-card-spacer="1" style={{ height: 'calc(var(--card-air) * 2)' }} aria-hidden />
        <div className="flex items-center gap-[0.5em]">
          <button
            type="button"
            disabled={busy || loading || (startBlocked !== null && !onBlockedPress)}
            onClick={startBlocked !== null ? onBlockedPress : onStartRun}
            className="card-btn flex-1 min-w-0 border border-primary/60 bg-primary/10 font-medium text-foreground hover:bg-primary/20 disabled:opacity-50"
            data-testid="train-start-run"
          >
            <Play />
            {startBlocked ?? 'Start a run'}
          </button>
          <div className="flex shrink-0 gap-[0.3em]" role="group" aria-label="How many puzzles">
            {LENGTHS.map(n => (
              <Chip key={n} selected={total === n} onClick={() => { changed('length', String(n)); onTotalChange(n); }}>
                {n}
              </Chip>
            ))}
          </div>
        </div>
        <TrainRowPicker
          icon={<SlidersHorizontal className="w-[1em] h-[1em]" />}
          label="Run"
          value={runSummary}
          testId="train-run-options"
          disabled={awaitingOptions}
          onOpen={opened}
          groups={[
            {
              title: 'Mode',
              options: modes.map(m => ({
                value: m.id as SessionSelection,
                label: SELECTION_LABEL[m.id] ?? m.id,
                disabled: !m.available,
                reason: m.available ? undefined : 'not available yet',
              })),
              value: selection,
              onChange: (v: SessionSelection) => { changed('mode', v); onSelectionChange(v); },
            },
            {
              title: areaChosenForYou ? 'Area (chosen for you in this mode)' : 'Area',
              options: [
                { value: null, label: 'All areas', disabled: areaChosenForYou },
                ...shownAreas.map(a => ({ value: a as SessionArea, label: AREA_LABEL[a] ?? a, disabled: areaChosenForYou })),
              ],
              value: areaChosenForYou ? undefined : area,
              onChange: (v: SessionArea | null) => { changed('area', v ?? 'all'); onAreaChange(v); },
            },
          ]}
        />
        {hasPlan && (
          <Link
            to="/puzzles/plan"
            data-testid="train-plan-link"
            className="w-full text-left flex items-center gap-[calc(var(--card-w,208px)*0.04)] py-[0.16em] text-[length:var(--card-type,14px)] text-muted-foreground hover:text-foreground transition-colors"
          >
            <CalendarDays className="w-[1em] h-[1em] shrink-0" />
            <span className="min-w-0 truncate">Your training plan</span>
            <ChevronRight className="ml-auto w-[1em] h-[1em]" />
          </Link>
        )}
        {today}
      </div>
    </>
  );
}

export default PuzzleTrainCard;
