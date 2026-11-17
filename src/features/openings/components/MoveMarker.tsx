/**
 * #177 (owner, 2026-11-17): the book-moves card in the reasons card's style. Each move row has a marker for its role:
 * the repertoire's move a filled gold dot, the playable alternative a gold ring, the opponent's main replies a filled
 * dot, their sidelines a ring, and theory outside the repertoire a small muted ring (its text is muted too). A shape,
 * not only a colour, tells them apart.
 */
export type MoveRole = 'chosen' | 'alternative' | 'main' | 'sideline' | 'other';

const SHAPE: Record<MoveRole, string> = {
  chosen: 'h-[0.62em] w-[0.62em] bg-primary',
  alternative: 'h-[0.62em] w-[0.62em] border-[0.14em] border-primary',
  main: 'h-[0.56em] w-[0.56em] bg-foreground/80',
  sideline: 'h-[0.56em] w-[0.56em] border-[0.13em] border-muted-foreground',
  other: 'h-[0.46em] w-[0.46em] border-[0.12em] border-muted-foreground/80',
};

const NAME: Record<MoveRole, string> = {
  chosen: "The repertoire's move",
  alternative: 'Also playable',
  main: 'Main reply',
  sideline: 'Sideline',
  other: 'Theory outside the repertoire',
};

export function MoveMarker({ role }: { role: MoveRole }) {
  return (
    <span className="inline-grid w-[0.9em] shrink-0 place-items-center" title={NAME[role]}>
      <span className={`rounded-full ${SHAPE[role]}`} aria-hidden />
      <span className="sr-only">{NAME[role]}: </span>
    </span>
  );
}

/** The divider between move rows, as between reasons; a row right under a group label has none (the label carries it). */
export const MOVE_ROW_RULE = 'border-t border-border first:border-t-0 [.move-group-label+&]:border-t-0';
