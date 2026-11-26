import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * ONE SETTING, ONE ROW, ONE LIST (#521, owner 2026-11-26: the theme list inside the strength-and-theme popover was a
 * dropdown inside a dropdown, and strength must be its own setting).
 *
 * The row is the card's row grammar (mark, label, value, chevron). A tap opens a PORTALLED list right under it: a
 * card is a fixed share of its lane and may never grow with its content, so the list goes over the cards, as the
 * strength-and-theme popover and the board-appearance popover already do (an inline expansion would be clipped).
 * Each group is plain buttons, the selected one in the page's one selection look (`border-primary bg-primary/10
 * text-link`); choosing closes the list. Escape or an outside press closes it too.
 */
export interface RowPickerOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Why a disabled option cannot be chosen, said beside it. */
  reason?: string;
}

export interface RowPickerGroup<T> {
  /** Shown above the group when the list has more than one. */
  title?: string;
  options: RowPickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function TrainRowPicker({
  icon, label, value, groups, footer, onOpen, testId, disabled = false,
}: {
  icon: ReactNode;
  label: string;
  /** The current choice, said in the row. */
  value: string;
  groups: RowPickerGroup<any>[];
  /** A line under the list (the strength band's "far from your rating"). */
  footer?: ReactNode;
  onOpen?: () => void;
  testId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = r.bottom + 6;
      setAnchor({ left: r.left, top, width: Math.max(r.width, 220), maxHeight: Math.max(160, window.innerHeight - top - 12) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(o => !o);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid={testId}
        className="w-full text-left flex items-center gap-[calc(var(--card-w,208px)*0.04)] py-[0.16em] text-[length:var(--card-type,14px)] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
      >
        <span className="shrink-0 inline-flex">{icon}</span>
        <span className="shrink-0">{label}</span>
        <span className="ml-auto min-w-0 truncate text-foreground">{value}</span>
        {open
          ? <ChevronUp className="shrink-0 w-[1em] h-[1em]" />
          : <ChevronDown className="shrink-0 w-[1em] h-[1em]" />}
      </button>

      {open && anchor && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={label}
          data-testid={testId ? `${testId}-list` : undefined}
          style={{ position: 'fixed', left: anchor.left, top: anchor.top, width: anchor.width, maxHeight: anchor.maxHeight, zIndex: 60 }}
          className="rounded-lg surface-card p-3 space-y-3 text-sm shadow-lg overflow-y-auto"
        >
          {/* Several groups sit side by side when the list is wide enough, so a long first group does not push the
              second below the window. */}
          <div className={groups.length > 1 && anchor.width >= 300 ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.title && <span className="text-xs text-muted-foreground block mb-1.5">{group.title}</span>}
              <div role="listbox" aria-label={group.title ?? label} className="flex flex-col gap-1">
                {group.options.map(option => {
                  const selected = option.value === group.value;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={option.disabled}
                      onClick={() => { group.onChange(option.value); setOpen(false); }}
                      className={`w-full text-left text-sm py-1.5 px-2.5 rounded border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        selected ? 'border-primary bg-primary/10 text-link' : 'border-transparent hover:bg-accent/50'}`}
                    >
                      {option.label}
                      {option.disabled && option.reason && <span className="ml-1.5 text-xs text-muted-foreground">{option.reason}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          </div>
          {footer}
        </div>,
        document.body,
      )}
    </>
  );
}

export default TrainRowPicker;
