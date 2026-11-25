/**
 * MANAGING PREMIUM IS ON /membership (#467 plan B5; wording approved by the owner 2026-11-24).
 *
 * Every sentence that tells a holder where to cancel, get a refund or see the renewal says "Membership page"
 * and links /membership. The one exception is account deletion, which stays on /profile ("your account page"),
 * so the Terms' deletion paragraph keeps its words. A sentence left pointing at /profile would send a holder to
 * a page that no longer has Manage or the refund: a legal promise broken by a stale link.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
/* Source text without comments, so a code comment mentioning the old words does not count. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\}/g, '');

const PREMIUM_FILES = [
  'src/features/premium/PremiumPage.tsx',
  'src/features/premium/PremiumClassic.tsx',
  'src/features/premium/stripeCheckout.ts',
  'src/features/premium/PendingLine.tsx',
  'src/features/premium/PremiumStatus.tsx',
  'src/features/premium/PremiumCard.tsx',
  'src/pages/RefundPolicy.tsx',
];

describe('managing Premium points at /membership', () => {
  for (const file of PREMIUM_FILES) {
    it(`${file}: no "account page" and no link to /profile`, () => {
      const src = code(file);
      expect(src).not.toMatch(/account page/i);
      expect(src).not.toMatch(/to="\/profile"/);
    });
  }

  it('the Terms: only the account-deletion paragraph keeps "account page"', () => {
    const src = code('src/pages/Terms.tsx');
    const paragraphs = src.split(/<\/p>/);
    const stale = paragraphs.filter((p) => /account page/i.test(p) && !/delete your account/i.test(p));
    expect(stale).toEqual([]);
    expect(src).toMatch(/Your <Link to="\/membership"[^>]*>Membership page<\/Link> shows the date of the next renewal/);
    expect(src).toMatch(/You can cancel at any time from your Membership page, with "Manage your subscription"/);
  });

  it('the Refund Policy: how to ask links /membership', () => {
    expect(code('src/pages/RefundPolicy.tsx')).toMatch(/On your <Link to="\/membership"[^>]*>Membership page<\/Link>, choose "Cancel and get a full/);
  });

  it('the pending line: the approved words', () => {
    expect(code('src/features/premium/stripeCheckout.ts')).toContain("'Your account already has a subscription. Manage it on your Membership page.'");
  });
});
