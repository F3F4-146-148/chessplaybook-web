import { ArrowLeft, CalendarDays, Play } from 'lucide-react';
import { Link } from 'react-router-dom';

import { RemindersSwitch } from '@/features/reminders/RemindersSwitch';
import { buildPlanCalendar, weeksWithSessions } from '../../lib/planCalendar';
import type { PlanItem, TrainingPlan } from '../../services/PlanApi';
import { PlanCalendar } from './PlanCalendar';
import { PlanCalendarExport } from './PlanCalendarExport';
import { AREA_LABEL, dayLabel } from './planFormat';

export interface PlanDetailsProps {
  plan: TrainingPlan;
  activeItem: PlanItem | null;
  nextItem: PlanItem | null;
  nextDayTotal: number;
  onStart: (itemId: string, area: string, total: number, kind: string) => void;
  onAbandon: () => void;
  /** #549: the offer after three weeks away. */
  onNewPlan?: () => void;
  onPickUp?: () => void;
  busy?: boolean;
  error?: string | null;
  justCreated?: boolean;
  onDismissJustCreated?: () => void;
  signedIn: boolean;
  returnTo: string;
  confirmStop: boolean;
  onConfirmStop: (open: boolean) => void;
}

export function PlanDetails({
  plan, activeItem, nextItem, nextDayTotal, onStart, onAbandon,
  onNewPlan, onPickUp, busy = false, error = null, justCreated = false, onDismissJustCreated,
  signedIn, returnTo, confirmStop, onConfirmStop,
}: PlanDetailsProps) {
  const weeks = buildPlanCalendar(plan);
  // #549: the weeks that hold a session, as the calendar draws them, and the last day.
  const lastDay = plan.items.map(i => i.scheduledOn).sort().at(-1);
  const offer = Boolean(plan.offerNewPlan) && !activeItem && onNewPlan != null && onPickUp != null;

  return (
    <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:grid-rows-[auto_auto_1fr]" data-testid="plan-panel">
      {offer ? (
        <NewPlanOfferCard busy={busy} onNewPlan={onNewPlan!} onPickUp={onPickUp!} />
      ) : (
        <NextSessionCard activeItem={activeItem} nextItem={nextItem} nextDayTotal={nextDayTotal}
          busy={busy} onStart={onStart} />
      )}

      <div className="h-full lg:col-start-1 lg:row-span-3 lg:row-start-1">
        <PlanCalendar weeks={weeks} activeItem={activeItem} nextItem={nextItem}
          busy={busy} onStart={onStart} />
      </div>

      <section className="surface-card rounded-lg border border-border px-3 py-2 text-sm lg:col-start-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <CalendarDays className="h-4 w-4" /> Plan progress
          </span>
          <span className="text-xs text-muted-foreground">{plan.progress.completed}/{plan.progress.items} sessions</span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border/60 pt-1.5 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{weeksWithSessions(weeks)}</strong> weeks
            {lastDay ? `, ends ${endLabel(lastDay)}` : ''}
          </span>
          <span><strong className="text-foreground">{plan.sessionsPerWeek}</strong> sessions/week</span>
          <span><strong className="text-foreground">{plan.positionsPerSession}</strong> per session</span>
          <span><strong className="text-foreground">{plan.progress.positionsDone}</strong>/{plan.progress.positions} positions</span>
        </div>
        {/* Reminders where the commitment is made (owner, 2026-11-12: the switch was "a bit
            too hidden", at the foot of the training record and in plan setup only). */}
        <div className="mt-1.5 border-t border-border/60 pt-1.5" data-testid="plan-reminders">
          <RemindersSwitch signedIn={signedIn} source="plan" compact />
        </div>
        {confirmStop ? (
          <div className="mt-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2">
            <p className="text-xs text-foreground">
              Stop this training plan? Remaining sessions are discarded. Everything you solved stays on your record.
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => { onConfirmStop(false); onAbandon(); }} disabled={busy}
                className="flex-1 rounded-md border border-destructive/50 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">Yes, stop it</button>
              <button type="button" onClick={() => onConfirmStop(false)}
                className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground">Keep it</button>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 flex justify-end border-t border-border/60 pt-1.5">
            <button type="button" onClick={() => onConfirmStop(true)} disabled={busy}
              className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50">Stop this training plan</button>
          </div>
        )}

        {justCreated && !signedIn && (
          <div className="mt-3 rounded-md border border-border bg-muted/40 p-2.5">
            <p className="text-xs text-foreground">This training plan lives on this device. Sign in and it follows you.</p>
            <div className="mt-2 flex items-center gap-2">
              <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">Sign in</Link>
              <button type="button" onClick={onDismissJustCreated}
                className="text-xs text-muted-foreground hover:text-foreground">Not now</button>
            </div>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </section>

      <div className="h-full lg:col-start-2"><PlanCalendarExport plan={plan} /></div>
    </div>
  );
}

/** "19 Dec" (#549). */
function endLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * #549: after three weeks with nothing done and sessions missed, the card asks
 * before the plan is moved again. A new plan stops this one (never deletes it:
 * owner, 2026-11-27); "Pick up from today" moves the sessions as before. Same
 * rows as the Next session card, so the column does not change height.
 */
function NewPlanOfferCard({ busy, onNewPlan, onPickUp }: {
  busy: boolean;
  onNewPlan: () => void;
  onPickUp: () => void;
}) {
  return (
    <section className="surface-card surface-card-promoted rounded-lg p-2.5 lg:col-start-2 lg:row-start-1"
      data-testid="plan-renew-offer">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Been away?</p>
      <p className="mt-0.5 font-semibold text-foreground">Start a new plan?</p>
      <p className="mt-0.5 text-xs text-muted-foreground">It's been over three weeks since your last session.</p>
      <div className="mt-1.5 flex items-start gap-2">
        {/* No icon and tight padding: both labels stay on one line from 360px up. The
            outline's 1px is taken off its padding so both buttons are the Next session
            card's button height and the card does not change size. */}
        <button type="button" disabled={busy} onClick={onNewPlan}
          className="flex-1 whitespace-nowrap rounded-lg bg-primary px-1.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          Start a new plan
        </button>
        <button type="button" disabled={busy} onClick={onPickUp}
          className="flex-1 whitespace-nowrap rounded-lg border border-border px-1.5 py-[5px] text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:opacity-50">
          Pick up from today
        </button>
      </div>
    </section>
  );
}

function NextSessionCard({ activeItem, nextItem, nextDayTotal, busy, onStart }: {
  activeItem: PlanItem | null;
  nextItem: PlanItem | null;
  nextDayTotal: number;
  busy: boolean;
  onStart: PlanDetailsProps['onStart'];
}) {
  if (!nextItem) {
    return <section className="surface-card surface-card-promoted rounded-lg p-3 lg:col-start-2">
      <p className="font-medium text-foreground">Training plan complete.</p>
      <p className="mt-1 text-xs text-muted-foreground">Every session is done.</p>
    </section>;
  }
  const area = nextItem.kind === 'review' ? 'Final review' : AREA_LABEL[nextItem.area];
  return (
    <section className="surface-card surface-card-promoted rounded-lg p-2.5 lg:col-start-2 lg:row-start-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{activeItem ? 'Under way' : 'Next session'}</p>
      <p className="mt-0.5 font-semibold text-foreground">{area} · {nextDayTotal} positions</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{dayLabel(nextItem.scheduledOn)}</p>
      {activeItem ? (
        <Link to="/puzzles" className="mt-1.5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <ArrowLeft className="h-4 w-4" /> Back to your run
        </Link>
      ) : (
        <button type="button" disabled={busy}
          onClick={() => onStart(nextItem.id, nextItem.area, nextItem.total, nextItem.kind)}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Play className="h-4 w-4" /> Start this session
        </button>
      )}
    </section>
  );
}

export default PlanDetails;
