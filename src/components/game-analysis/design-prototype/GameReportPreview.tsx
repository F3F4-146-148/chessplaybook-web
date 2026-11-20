/**
 * /dev/game-report (#374, plan A1): the Game report from fixtures, dev only (the
 * route is gated behind `import.meta.env.DEV` in app/routes.tsx, so it never ships).
 *
 * One real game (Tal - Jimenez Morales 1992, its browser analysis saved) and three
 * summary states. Before the switch (plan B5) it shows the new parts one by one and
 * the dialog as it is today; from B5 on, the new dialog. The guard (plan C1) and the
 * owner's review use it. The theme is the site's own switch in the nav.
 */
import { useMemo, useRef, useState } from 'react';
import { analyzeFullGame } from '@/services/GameAnalysisService';
import { GameReportDialog } from '../GameReportDialog';
import { MoveClassIcon } from '../MoveClassIcon';
import { ReportGraph } from '../ReportGraph';
import { buildReportView, type ClassKey } from '../reportView';
import { FIXTURE_GAME, FIXTURE_METADATA, fixtureSummary, type FixtureSummaryState } from '../fixtures/gameReportFixtures';

const STATES: FixtureSummaryState[] = ['long', 'short', 'none'];
const GRAPH_DOTS: ClassKey[] = ['brilliant', 'inaccuracy', 'mistake', 'blunder', 'severe_blunder'];

export default function GameReportPreview() {
  /* `?open=long|short|none` opens the report at load, so page-wide checks
     (verify-text-contrast) can read it. */
  const initial = new URLSearchParams(window.location.search).get('open') as FixtureSummaryState | null;
  const [state, setState] = useState<FixtureSummaryState>(initial && STATES.includes(initial) ? initial : 'long');
  const [open, setOpen] = useState(!!initial);
  const openRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState(FIXTURE_GAME.evals.length - 1);
  const analysis = useMemo(
    () => analyzeFullGame(FIXTURE_GAME.evals, FIXTURE_GAME.bestMoves, FIXTURE_GAME.mateIn, FIXTURE_GAME.uci, 'white', null),
    [],
  );
  const summary = fixtureSummary(state);
  const view = useMemo(
    () => buildReportView({ analysis, summary, metadata: FIXTURE_METADATA, sans: FIXTURE_GAME.san, gameResult: 'white' }),
    [analysis, summary],
  );
  const dots = analysis.classifiedMoves
    .filter(m => (GRAPH_DOTS as string[]).includes(m.classification))
    .map(m => ({ position: m.moveIndex + 1, key: m.classification as ClassKey }));

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-[900px] flex-col gap-8">
        <header className="flex flex-col gap-2 border-b border-border pb-4">
          <h1 className="text-2xl font-semibold">Game report preview</h1>
          <p className="text-sm text-muted-foreground">
            Fixtures for #374: {FIXTURE_GAME.white} - {FIXTURE_GAME.black}, {FIXTURE_GAME.san.length} plies. The board here is a
            number: the last jump went to position <span data-preview-position>{position}</span>.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Summary">
            {STATES.map(s => (
              <button key={s} type="button" aria-pressed={state === s} onClick={() => setState(s)}
                className={`card-btn ${state === s ? 'bg-primary text-primary-foreground' : ''}`}>
                {s === 'long' ? 'Long summary' : s === 'short' ? 'Short summary' : 'No summary'}
              </button>
            ))}
            <button ref={openRef} type="button" className="card-btn" onClick={() => setOpen(true)} data-preview-open>Open the report</button>
          </div>
        </header>

        <section className="flex flex-col gap-3" aria-label="The graph">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Graph (A4, A5)</h2>
          <div className="max-w-[628px]">
            <ReportGraph evals={analysis.evalGraph} phases={view.phases} dots={dots} currentPosition={position}
              onMoveClick={setPosition} sans={FIXTURE_GAME.san} />
          </div>
          <div className="max-w-[339px]">
            <ReportGraph evals={analysis.evalGraph} phases={view.phases} dots={dots} currentPosition={position}
              onMoveClick={setPosition} sans={FIXTURE_GAME.san} height={96} />
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-label="The icons">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Move-class icons (A3)</h2>
          <div className="flex flex-wrap gap-4">
            {view.classes.map(c => (
              <span key={c.key} className="flex items-center gap-2 text-sm"><MoveClassIcon classKey={c.key} />{c.name}</span>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-label="The view model">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">View model (A2)</h2>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({ ...view, classes: view.classes.map(c => ({ ...c, moves: c.moves.map(m => m.label) })) }, null, 2)}</pre>
        </section>
      </div>

      <GameReportDialog
        open={open}
        onOpenChange={setOpen}
        analysis={analysis}
        summary={summary}
        moveIndex={position}
        onMoveClick={setPosition}
        metadata={FIXTURE_METADATA}
        sans={FIXTURE_GAME.san}
        gameResult="white"
        returnFocusTo={openRef}
      />
    </div>
  );
}
