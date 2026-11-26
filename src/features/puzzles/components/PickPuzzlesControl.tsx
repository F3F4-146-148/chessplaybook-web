import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { PUZZLE_THEMES, RATING_PRESETS } from '../hooks/usePuzzleSettings';
import { ThemeListbox } from './ThemeListbox';
import { logGA4Event } from '@/services/analytics';

/**
 * The strength and theme picker: a row in a card that opens a PORTALLED popover (#521 extracted it from the
 * settings card so the new arrangement's "What to train" card can hold the same control; the look is unchanged).
 *
 * WHY A PORTAL. A card is a fixed share of its column and may never be resized by its content, so an inline
 * expansion would be clipped. The board-appearance popover was portalled on 2026-08-10 for the same reason, and
 * `z-index` was tried first and did nothing: it orders painting, it does not escape a clipping ancestor. Anchored to
 * the row and positioned on measurement, because the card's height moves with the viewport.
 */
export interface PickPuzzlesControlProps {
  theme: string;
  onThemeChange: (v: string) => void;
  filterMode: 'auto' | 'manual';
  onFilterModeChange: (v: 'auto' | 'manual') => void;
  ratingRange: { min: number; max: number };
  onRatingRangeChange: (v: { min: number; max: number }) => void;
  /** True when the chosen band is far enough from the player's rating to freeze it. */
  bandIsFarFromRating?: boolean;
  /** Where the control is, for GA4 (#521). */
  surface: 'settings' | 'train';
  /** The row's text; "Pick puzzles" in the settings card, the current choice in the train card. */
  label?: ReactNode;
  /** The row's trailing word instead of the chevron (the train card's "Change"). */
  action?: string;
}

export function bandLabelOf(filterMode: 'auto' | 'manual', ratingRange: { min: number; max: number }): string {
  return filterMode === 'auto'
    ? 'matched to your record'
    : RATING_PRESETS.find(p => p.min === ratingRange.min && p.max === ratingRange.max)?.label
      ?? `${ratingRange.min}–${ratingRange.max}`;
}

/** The train card's line: "Mixed · Your level", "Fork · Advanced". */
export function currentChoiceLabel(theme: string, filterMode: 'auto' | 'manual', ratingRange: { min: number; max: number }): string {
  const themeText = theme ? (PUZZLE_THEMES.find(t => t.value === theme)?.label ?? theme) : 'Mixed';
  const bandText = filterMode === 'auto' ? 'Your level' : bandLabelOf(filterMode, ratingRange);
  return `${themeText} · ${bandText}`;
}

export function PickPuzzlesControl({
  theme, onThemeChange,
  filterMode, onFilterModeChange,
  ratingRange, onRatingRangeChange,
  bandIsFarFromRating = false,
  surface, label = 'Pick puzzles', action,
}: PickPuzzlesControlProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({ left: r.left, top: r.bottom + 6, width: Math.max(r.width, 240) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  /* Close on an outside click or Escape: a popover with no way out is a trap, and this one covers the cards beside it. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const bandLabel = bandLabelOf(filterMode, ratingRange);
  const logSurface = surface === 'train' ? 'train' : 'settings';

  return (
    <>
      {/* The same row grammar as the Toggle rows and `StandingLink`: mark, label, control. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          /* #521: whether the picker is found at all, before anything is chosen in it. */
          if (!open) logGA4Event({ name: 'puzzle_filter_opened', params: { surface: logSurface } });
          setOpen(o => !o);
        }}
        aria-expanded={open}
        data-testid="strength-themes"
        className="w-full text-left flex items-center gap-[calc(var(--card-w,208px)*0.04)] py-[0.16em] text-[length:var(--card-type,14px)] text-muted-foreground hover:text-foreground transition-colors"
      >
        <SlidersHorizontal className="w-[1em] h-[1em] shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
        {action
          ? <span className="ml-auto shrink-0 text-link">{action}</span>
          : open
            ? <ChevronUp className="ml-auto w-[1em] h-[1em]" />
            : <ChevronDown className="ml-auto w-[1em] h-[1em]" />}
      </button>

      {open && anchor && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Strength and themes"
          data-testid="strength-themes-popover"
          style={{ position: 'fixed', left: anchor.left, top: anchor.top, width: anchor.width, zIndex: 60 }}
          className="rounded-lg surface-card p-3 space-y-3 text-sm shadow-lg"
        >
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Theme</span>
            {/* A list of our own, not the platform's (owner, 2026-08-15): a native select popup is drawn by the OS
                and can never take the page's surface; keyboard and screen reader are paid for in ThemeListbox. */}
            <ThemeListbox
              value={theme}
              onChange={(next) => {
                logGA4Event({ name: 'puzzle_filter_changed', params: { kind: 'theme', value: next || 'all', surface: logSurface } });
                onThemeChange(next);
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-2">
              Strength · {bandLabel}
            </label>
            <div className="flex gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  logGA4Event({ name: 'puzzle_filter_changed', params: { kind: 'strength', value: 'auto', surface: logSurface } });
                  onFilterModeChange('auto');
                }}
                className={`text-xs py-1.5 px-2.5 rounded border transition-all ${
                  filterMode === 'auto'
                    ? 'border-primary bg-primary/10 text-link'
                    : 'border-border hover:bg-accent/50'}`}
              >
                Auto
              </button>
              {RATING_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    logGA4Event({ name: 'puzzle_filter_changed', params: { kind: 'strength', value: preset.label, surface: logSurface } });
                    onFilterModeChange('manual');
                    onRatingRangeChange({ min: preset.min, max: preset.max });
                  }}
                  className={`text-xs py-1.5 px-2.5 rounded border transition-all ${
                    filterMode === 'manual'
                      && ratingRange.min === preset.min
                      && ratingRange.max === preset.max
                      ? 'border-primary bg-primary/10 text-link'
                      : 'border-border hover:bg-accent/50'}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {/* This line belongs to the BAND, not to the Rated switch (moved 2026-08-06). */}
            {bandIsFarFromRating && (
              <p className="mt-2 text-xs text-muted-foreground">
                This band is far from your rating, so these solves will not move it.
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default PickPuzzlesControl;
