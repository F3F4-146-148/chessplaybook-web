import type { ReactNode } from 'react';
import { ArrowUpRight, Crosshair, Shield, SquareDot } from 'lucide-react';
import { REASON_KIND_NAMES, reasonKind, type ReasonKind } from '../reasonKinds';

/**
 * #177 (owner, 2026-11-17, option B "kind markers"): the reasons of a move, in the order they arrive, each with a
 * small marker for its kind and a thin divider between lines. The text is shown word for word (owner: never trim).
 */

/** Structure and trades: a pawn, drawn in lucide's stroke style (lucide has no chess pieces). */
function PawnIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={props.className}>
      <circle cx="12" cy="6.5" r="3" />
      <path d="M9.5 10.5h5l1.5 7h-8z" />
      <path d="M6 20.5h12" />
    </svg>
  );
}

const ICON: Record<ReasonKind, (p: { className?: string }) => ReactNode> = {
  threat: (p) => <Crosshair aria-hidden className={p.className} />,
  centre: (p) => <SquareDot aria-hidden className={p.className} />,
  development: (p) => <ArrowUpRight aria-hidden className={p.className} />,
  king: (p) => <Shield aria-hidden className={p.className} />,
  structure: (p) => <PawnIcon className={p.className} />,
};

/* Whole class names, so Tailwind sees them (the colours are the reason-* roles, 3:1 on the card: contrast.test.ts). */
const TONE: Record<ReasonKind, string> = {
  threat: 'text-reason-threat bg-reason-threat/15',
  centre: 'text-reason-centre bg-reason-centre/15',
  development: 'text-reason-development bg-reason-development/15',
  king: 'text-reason-king bg-reason-king/15',
  structure: 'text-reason-structure bg-reason-structure/15',
};

/* #324: the reason being said or selected, a soft tint of its kind with a bar in that colour on its left. */
const ACTIVE: Record<ReasonKind, string> = {
  threat: 'bg-reason-threat/10 shadow-[inset_3px_0_0_hsl(var(--reason-threat))]',
  centre: 'bg-reason-centre/10 shadow-[inset_3px_0_0_hsl(var(--reason-centre))]',
  development: 'bg-reason-development/10 shadow-[inset_3px_0_0_hsl(var(--reason-development))]',
  king: 'bg-reason-king/10 shadow-[inset_3px_0_0_hsl(var(--reason-king))]',
  structure: 'bg-reason-structure/10 shadow-[inset_3px_0_0_hsl(var(--reason-structure))]',
};

export interface ReasonItem { key?: string; text: string }

/**
 * `active`: the reason the board shows (#324: the one he is saying, or the one selected); `onSelect`: a press on a
 * reason, which then shows its marks on the board. Without `onSelect` the rows are plain text, as before.
 */
export function ReasonList({ reasons, empty, active = null, onSelect }: {
  reasons: ReasonItem[];
  empty: string;
  active?: number | null;
  onSelect?: (index: number) => void;
}) {
  if (!reasons.length) return <p className="leading-snug text-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col text-foreground" data-reason-list>
      {reasons.map((r, i) => {
        const kind = reasonKind(r.key);
        const Icon = ICON[kind];
        const on = active === i;
        const row = `grid w-full grid-cols-[1.45em_minmax(0,1fr)] items-start gap-[0.65em] py-[0.5em] text-left leading-snug ${i === 0 ? 'font-medium' : ''}`;
        const body = (
          <>
            <span className={`mt-[0.02em] grid h-[1.45em] w-[1.45em] place-items-center rounded-[0.4em] ${TONE[kind]}`} title={REASON_KIND_NAMES[kind]}>
              {Icon({ className: 'h-[0.95em] w-[0.95em]' })}
              <span className="sr-only">{REASON_KIND_NAMES[kind]}: </span>
            </span>
            <span>{r.text}</span>
          </>
        );
        return (
          <li
            key={i}
            data-reason-kind={kind}
            data-reason-active={on ? '' : undefined}
            className={`border-t border-border first:border-t-0 [&:first-child>*]:pt-[0.1em] ${on ? `rounded-[0.35em] ${ACTIVE[kind]}` : ''}`}
          >
            {onSelect ? (
              <button type="button" aria-pressed={on} onClick={() => onSelect(i)} className={`${row} rounded-[0.35em] px-[0.35em] hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring`}>
                {body}
              </button>
            ) : (
              <div className={row}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
