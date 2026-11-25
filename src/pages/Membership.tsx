/**
 * /membership (#467): the account's Premium. Built in plan B3; this is the route's page (B2).
 */
import SeoHead from '@/components/SeoHead';
import { MembershipPage } from '@/features/premium/membership/MembershipPage';

const Membership = () => (
  <>
    <SeoHead routeKey="membership" />
    <MembershipPage />
  </>
);

export default Membership;
