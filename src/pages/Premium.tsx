/**
 * /premium: the redesigned page (#261) under design v2, the classic one when the switch is off
 * (the redesign's rollback leaves this page as it was).
 */
import { DESIGN_V2_LIVE } from '@/design/designFlags';
import PremiumClassic from '@/features/premium/PremiumClassic';
import PremiumPage from '@/features/premium/PremiumPage';

const Premium = () => (DESIGN_V2_LIVE ? <PremiumPage /> : <PremiumClassic />);

export default Premium;
