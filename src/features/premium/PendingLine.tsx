/**
 * The line for a purchase that has not gone through yet (STRIPE_PENDING_LINE), with its last words a link to
 * /membership, where Manage is (#467 B5, owner-approved wording 2026-11-24). Stripe's portal returns to /premium,
 * and a pending account is not a holder there, so without the link the only way back to Manage was the menu.
 */
import { Link } from 'react-router-dom';
import { logGA4Event } from '@/services/analytics';

export function PendingLine({ linkClassName = 'text-link hover:underline' }: { linkClassName?: string }) {
  return (
    <>
      Your account already has a subscription. Manage it on your{' '}
      <Link
        to="/membership"
        onClick={() => logGA4Event({ name: 'premium_link_clicked', params: { from: 'pending_line' } })}
        className={linkClassName}
      >
        Membership page
      </Link>.
    </>
  );
}
