import { FastForward, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { Toggle } from './TrainerUI';
import { PickPuzzlesControl } from './PickPuzzlesControl';

/**
 * PUZZLE SETTINGS — the same three rows, the same icons, the same order as
 * production: Rated, Auto next, Pick puzzles.
 *
 * THE LABELS ARE SHORT BECAUSE THE LANE IS (owner, 2026-10-06/07). "Auto-start
 * next" (7.12em) and "Strength & themes" (8.73em) wrapped between 1100 and 1279
 * wide, where the lane is a fixed 208px and the type at its largest: the rows
 * have 5.66em and 7.34em there, and the wrapped row pushed the card's last line
 * out of the card (34px at 1100x900). "Auto next" is 4.52em and "Pick puzzles"
 * 5.94em. The panel it opens is headed "Theme" and "Strength", so the label
 * says what you do there rather than naming the setting a third way. The
 * panel itself keeps its name, "Strength and themes".
 *
 * The picker row and its portalled popover are `PickPuzzlesControl` (#521): the
 * new arrangement moves them into its "What to train" card (`showPicker` false
 * here), and both places draw the same control.
 */
export interface PuzzleSettingsCardProps {
  rated: boolean;
  onRatedChange: (v: boolean) => void;
  autoAdvance: boolean;
  onAutoAdvanceChange: (v: boolean) => void;
  theme: string;
  onThemeChange: (v: string) => void;
  filterMode: 'auto' | 'manual';
  onFilterModeChange: (v: 'auto' | 'manual') => void;
  ratingRange: { min: number; max: number };
  onRatingRangeChange: (v: { min: number; max: number }) => void;
  /** True when the chosen band is far enough from the player's rating to freeze it. */
  bandIsFarFromRating?: boolean;
  /** The picker row; off in the new arrangement, where the "What to train" card holds it (#521). */
  showPicker?: boolean;
}

export function PuzzleSettingsCard({
  rated, onRatedChange,
  autoAdvance, onAutoAdvanceChange,
  theme, onThemeChange,
  filterMode, onFilterModeChange,
  ratingRange, onRatingRangeChange,
  bandIsFarFromRating = false,
  showPicker = true,
}: PuzzleSettingsCardProps) {
  return (
    <>
      <span className="card-label inline-flex items-center gap-[0.35em]">
        <SlidersHorizontal className="w-[1em] h-[1em]" />
        Puzzle settings
      </span>
      <div className="card-body">
        <Toggle
          icon={<TrendingUp className="w-[1em] h-[1em]" />}
          checked={rated}
          onChange={onRatedChange}
          label="Rated"
          testId="rated-toggle"
          hintLines={1}
        />
        <Toggle
          icon={<FastForward className="w-[1em] h-[1em]" />}
          checked={autoAdvance}
          onChange={onAutoAdvanceChange}
          label="Auto next"
          testId="auto-advance-toggle"
          hintLines={1}
        />
        {showPicker && (
          <PickPuzzlesControl
            theme={theme}
            onThemeChange={onThemeChange}
            filterMode={filterMode}
            onFilterModeChange={onFilterModeChange}
            ratingRange={ratingRange}
            onRatingRangeChange={onRatingRangeChange}
            bandIsFarFromRating={bandIsFarFromRating}
            surface="settings"
          />
        )}
      </div>
    </>
  );
}

export default PuzzleSettingsCard;
