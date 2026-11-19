import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ABOUT_TRAINER, ABOUT_TRAINER_TITLE } from '../aboutTrainer';

/** The sections of how the trainer works, as text: shared by the panel and the page's closed state. */
export function AboutTrainerText({ headingLevel = 'h4' }: { headingLevel?: 'h2' | 'h3' | 'h4' }) {
  const Heading = headingLevel;
  return (
    <>
      {ABOUT_TRAINER.map((section) => (
        <section key={section.heading} className="flex flex-col gap-1">
          <Heading className="text-sm font-semibold text-foreground">{section.heading}</Heading>
          {section.lines.map((line) => (
            <p key={line} className="text-sm leading-snug text-muted-foreground">{line}</p>
          ))}
        </section>
      ))}
    </>
  );
}

/**
 * "ABOUT THIS TRAINER", drawn over the context lane (prerender plan B3, owner 2026-11-19), the way the explanation is
 * drawn over the activity lane: the board stays where it is and nothing on the page moves. The panel scrolls inside
 * itself when the lane is short.
 */
export function PuzzleAboutPanel({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // focus moves into the panel, so a keyboard reader lands on it; `preventScroll` keeps a stacked page still
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="flex min-h-full flex-col gap-3 p-3" data-testid="puzzle-about">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{ABOUT_TRAINER_TITLE}</h3>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <AboutTrainerText />
    </div>
  );
}

export default PuzzleAboutPanel;
