/**
 * Terms of Service Page
 *
 * Defines the terms and conditions for using Chess Playbook, including Premium: payment through
 * Stripe Managed Payments, whose affiliate Sold through Link, LLC is the merchant of record (Stripe's
 * service terms, read 2026-11-23), renewal, cancellation and the refund rule (owner, 2026-11-13: a full
 * refund within 30 days of a payment; Link may also refund under its own policy within 60 days).
 * Stripe's terms ask that the subscription terms, the cancellation method and a link to Link's
 * customer terms are given before checkout. The company details come from src/config/company.ts.
 */

import { Link } from 'react-router-dom';
import SeoHead from '@/components/SeoHead';
import { LEGAL_LAST_UPDATED, formatLegalDate } from '@/config/legalDates';
import { COMPANY } from '@/config/company';

const H2 = 'text-2xl font-semibold text-foreground mb-4';
const H3 = 'text-xl font-semibold text-link mb-3';
const P = 'text-muted-foreground mb-4';
const UL = 'list-disc list-inside text-muted-foreground mb-4 space-y-2';
const A = 'text-link hover:underline';

const Terms = () => {
  return (
    <>
      <SeoHead routeKey="terms" />

      <div className="bg-background flex flex-col">
        <div className="py-12 px-4 sm:px-6 lg:px-8 flex-grow">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-8">Terms of Service</h1>

            <div className="prose prose-invert max-w-none">
              <p className="text-muted-foreground mb-6">
                <strong>Last Updated:</strong> {formatLegalDate(LEGAL_LAST_UPDATED.terms)}
              </p>

              <section className="mb-8">
                <h2 className={H2}>Agreement to Terms</h2>
                <p className={P}>
                  By using Chess Playbook ("the Website"), you agree to these Terms of Service. If you do not
                  agree, please do not use the Website.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Who We Are</h2>
                <p className={P}>
                  Chess Playbook is run by {COMPANY.legalName}, registration number (CUI) {COMPANY.registrationNumber},
                  {' '}{COMPANY.address}, {COMPANY.country} ("we", "us"). You can write to us at{' '}
                  <a href={`mailto:${COMPANY.email}`} className={A}>{COMPANY.email}</a>.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Use of the Website</h2>

                <h3 className={H3}>Permitted Use</h3>
                <p className={P}>You may use the Website to:</p>
                <ul className={UL}>
                  <li>Solve puzzles, train openings and play games</li>
                  <li>View and study chess games from World Champions</li>
                  <li>Analyse positions and games with the Website's tools</li>
                </ul>

                <h3 className={H3}>Prohibited Use</h3>
                <p className={P}>You may NOT:</p>
                <ul className={UL}>
                  <li>Use automated tools or bots to scrape or download content in bulk</li>
                  <li>Attempt to hack, disrupt, or damage the Website</li>
                  <li>Use the Website for any illegal purposes</li>
                  <li>Impersonate others or provide false information</li>
                  <li>Redistribute or sell content from the Website without permission</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Accounts</h2>
                <p className={P}>
                  Most of the Website works without an account. If you buy Premium without signing in, we create an
                  account for you with the email you pay with, and email you a link to set its password. Keep your
                  sign-in details to yourself: you are responsible for what is done with your account.
                </p>
                <p className={P}>
                  You can delete your account at any time from your{' '}
                  <Link to="/profile" className={A}>account page</Link>. Deleting your account cancels a Premium
                  subscription straight away and ends a one-year pass, and Premium ends. If we cannot reach our
                  payment provider to cancel at that moment, the account page asks you to try again. If you want a refund, ask for
                  it before you delete your account.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>The Free Plan and Premium</h2>
                <p className={P}>
                  {/* #521 C (owner-approved 2026-11-26): puzzles moved from the free list to the limited one.
                      2026-11-27: guided games with the Master (#428, 1 a day) joined the limited list, and training
                      plans left the free one (their sessions are puzzles). */}
                  Champion games, news, the analysis board and games against other players or the computer are
                  free. On the free plan, some features can have a daily limit, such as puzzles, guided games with
                  the Master, the game report, position explanations, Champion Challenge, and opening learning
                  and training. Premium has no daily limits.
                </p>
                <p className={P}>Premium is a digital service with no human coaching. You can buy it as:</p>
                <ul className={UL}>
                  <li>A monthly subscription, where it is offered</li>
                  <li>A yearly subscription</li>
                  <li>A one-year pass, paid once, which does not renew</li>
                </ul>
                <p className={P}>
                  Premium starts as soon as your payment is confirmed. The price you pay is the one shown at
                  checkout.
                </p>
                {/* Owner-approved 2026-11-24 (premium grants plan D8). */}
                <p className={P}>
                  We sometimes give Premium for free, for example by invitation. Premium we give has no cash
                  value, cannot be transferred, and we may end it at any time.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Payment</h2>
                <p className={P}>
                  Premium is sold through Link. Sold through Link, LLC, an affiliate of Stripe, is the Merchant of
                  Record for all our orders: it takes your payment and sends your receipt, and the payment shows
                  on your statement as LINK.COM*. We are the seller of Premium and are responsible for it.
                </p>
                <p className={P}>
                  For a question about a payment or a receipt, contact{' '}
                  <a href="https://support.link.com/topics/sold-through-link" target="_blank" rel="noopener noreferrer" className={A}>Link support</a>. For anything about Premium itself, write to us.
                </p>
                <p className={P}>
                  Prices are shown in your currency for most countries, otherwise in US dollars, and include any
                  sales tax or VAT. Your payment details go to
                  Link. We never see your card number. Link's{' '}
                  <a href="https://link.com/terms" target="_blank" rel="noopener noreferrer" className={A}>terms</a>{' '}
                  also apply to your purchase.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Renewal and Cancellation</h2>
                <p className={P}>
                  A subscription renews automatically at the end of each month or year, and Link charges the
                  same payment method. Your <Link to="/membership" className={A}>Membership page</Link> shows the date of the next renewal.
                </p>
                <p className={P}>
                  You can cancel at any time from your Membership page, with "Manage your subscription". When you
                  cancel there, you keep Premium until the end of the period you have paid for, and you are not
                  charged again. You can also manage the subscription in your Link account.
                </p>
                <p className={P}>
                  If a renewal payment fails, Link tries again for about two weeks, and you keep Premium
                  meanwhile. If it still fails, the subscription ends.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Refunds</h2>
                <p className={P}>
                  You can have a full refund of any Premium payment within 30 days of that payment, for any
                  reason. After 30 days, we do not refund that payment. This applies to subscriptions and to the
                  one-year pass. A refund ends the Premium that payment paid for, and refunding a subscription's
                  latest payment also cancels the subscription.
                </p>
                <p className={P}>
                  Link may also refund a payment under its own{' '}
                  <a href="https://support.link.com/questions/sold-through-link-refunds" target="_blank" rel="noopener noreferrer" className={A}>refund policy</a>, within 60 days, for
                  example if the payment was not authorised.
                </p>
                <p className={P}>
                  The details and how to ask are in our{' '}
                  <Link to="/refund-policy" className={A}>Refund Policy</Link>.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Price Changes</h2>
                <p className={P}>
                  We may change Premium's prices. A new price never applies to a period you have already paid
                  for. If the price of your subscription changes, we tell you by email at least 30 days before
                  the renewal it applies to, so you can cancel first.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Content and Intellectual Property</h2>

                <h3 className={H3}>Chess Game Data</h3>
                <p className={P}>
                  Chess games displayed on this Website are sourced from publicly available PGN (Portable Game Notation)
                  files. Game moves themselves are factual data and not subject to copyright. However, annotations,
                  commentary, and our presentation are protected.
                </p>

                <h3 className={H3}>Website Content</h3>
                <p className={P}>
                  The Website's code is free software. You can use, copy and change it under the GNU General Public
                  License, version 3 or later. The source is at{' '}
                  <a
                    href="https://github.com/F3F4-146-148/chessplaybook-web"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={A}
                  >
                    github.com/F3F4-146-148/chessplaybook-web
                  </a>
                  .
                </p>
                <p className={P}>
                  That licence covers the code only. Our articles and other original content are owned by{' '}
                  {COMPANY.legalName}. All rights reserved.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Disclaimer of Warranties</h2>
                <p className={P}>
                  The Website is provided "AS IS" and "AS AVAILABLE" without any warranties of any kind, either express or implied.
                  We do not guarantee:
                </p>
                <ul className={UL}>
                  <li>Accuracy or completeness of chess game data</li>
                  <li>Uninterrupted or error-free operation</li>
                  <li>That the Website will meet your specific requirements</li>
                  <li>That all bugs or errors will be corrected</li>
                </ul>
                <p className={P}>
                  Nothing in these terms limits the rights you have as a consumer under the law of the country
                  where you live.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Limitation of Liability</h2>
                <p className={P}>
                  To the fullest extent permitted by law, {COMPANY.legalName} shall not be liable for:
                </p>
                <ul className={UL}>
                  <li>Any indirect, incidental, or consequential damages</li>
                  <li>Loss of data or profits arising from use of the Website</li>
                  <li>Errors or inaccuracies in chess game data</li>
                  <li>Interruptions or technical issues</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className={H2}>External Links</h2>
                <p className={P}>
                  The Website may contain links to third-party websites. We are not responsible for the
                  content, privacy practices, or terms of service of external sites.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Changes to Terms</h2>
                <p className={P}>
                  We may change these Terms of Service. The "Last Updated" date at the top shows when they last
                  changed. If a change affects Premium you have paid for, we tell you by email before it applies.
                  If you keep using the Website after a change, you accept the new terms.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Termination</h2>
                <p className={P}>
                  We may suspend or close an account that breaks these Terms of Service or harms other users. If
                  we end Premium early for any other reason, we refund the part you have not used.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Governing Law</h2>
                <p className={P}>
                  These Terms of Service are governed by the law of {COMPANY.country}. If you are a consumer, you
                  also keep the protection of the law of the country where you live.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Contact Information</h2>
                <p className={P}>
                  If you have questions about these Terms of Service, write to{' '}
                  <a href={`mailto:${COMPANY.email}`} className={A}>{COMPANY.email}</a> or use our{' '}
                  <Link to="/contact" className={A}>Contact page</Link>.
                </p>
              </section>

              <section className="mb-8">
                <h2 className={H2}>Severability</h2>
                <p className={P}>
                  If any provision of these Terms is found to be unenforceable or invalid, that provision
                  shall be limited or eliminated to the minimum extent necessary, and the remaining provisions
                  shall remain in full force and effect.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Terms;
