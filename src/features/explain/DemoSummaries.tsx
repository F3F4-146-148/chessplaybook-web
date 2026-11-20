import { SECTION_TITLES } from '@/components/game-analysis/PositionExplanationCard';
import { Button } from '@/components/ui/button';
import { SECTION_DISPLAY_ORDER, type StructuredExplanation } from '@/types/positionExplanation';

export interface DemoSummary {
  id: string;
  title: string;
  subtitle: string;
  structured: StructuredExplanation;
}

/**
 * WHAT THE EXPLAINER SAYS ABOUT EACH DEMO (prerender plan F1, owner's choice 2026-11-20).
 *
 * The six demos' baked explanations, in short: the verdict, the action line and each section's summary. It is the page's
 * own text in its built HTML (owner: the six demos may be public); the full explanation is one click away on the board.
 */
export function DemoSummaries({ demos, onLoad }: { demos: DemoSummary[]; onLoad: (id: string) => void }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 pb-8 lg:pb-12 max-w-6xl mx-auto w-full" aria-labelledby="demo-summaries">
      <h2 id="demo-summaries" className="text-xl sm:text-2xl font-semibold text-foreground mb-1">
        What the explainer says
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        The six positions in short. Load one on the board to read the whole explanation.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {demos.map((demo) => {
          const sections = SECTION_DISPLAY_ORDER
            .map((key) => ({ key, summary: demo.structured.sections[key]?.summary?.trim() }))
            .filter((s): s is { key: typeof s.key; summary: string } => Boolean(s.summary));
          return (
            <article key={demo.id} className="rounded-lg border border-border bg-card p-4 sm:p-5 flex flex-col">
              <h3 className="text-base sm:text-lg font-semibold text-foreground">{demo.title}</h3>
              <p className="text-xs text-muted-foreground">{demo.subtitle}</p>
              <p className="mt-3 text-sm text-foreground">
                <span className="font-semibold">{demo.structured.verdict.eval}.</span> {demo.structured.action}
              </p>
              {sections.length > 0 && (
                <dl className="mt-3 space-y-1.5 text-sm">
                  {sections.map((s) => (
                    <div key={s.key}>
                      <dt className="inline font-medium text-link">{SECTION_TITLES[s.key]}: </dt>
                      <dd className="inline text-muted-foreground">{s.summary}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="mt-auto pt-4">
                <Button variant="outline" size="sm" onClick={() => onLoad(demo.id)}>
                  Load it on the board
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
