import { startTransition, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Youtube } from 'lucide-react';
import { COMPANY } from '@/config/company';
import { YOUTUBE_CHANNEL_URL } from '@/config/social';
import { logGA4Event } from '@/services/analytics';

/**
 * The SITE footer, rendered once by the content layout route (#72).
 *
 * `data-site-footer` marks it, for the same reason `[data-nav-row]` marks the
 * bar: a probe counting `<footer>` elements cannot tell this apart from an
 * article's own closing note, which is valid HTML and which `/news/candidates-2026`
 * legitimately has. Counting bare tags reported two footers on that page and it
 * was the probe that was wrong.
 */
export const Footer = () => {
  // Prerender plan A4: the build's year first (the same in the built page and the browser's first render), today's after.
  const [currentYear, setCurrentYear] = useState<number>(() => (typeof __BUILD_YEAR__ !== 'undefined' ? __BUILD_YEAR__ : new Date().getFullYear()));
  // a transition, held until a built page is taken over (see ThemeProvider)
  useEffect(() => { startTransition(() => setCurrentYear(new Date().getFullYear())); }, []);

  const footerSections = [
    {
      title: "Play",
      links: [
        { label: "Play Online", to: "/play-online" },
        { label: "Play vs Computer", to: "/play" },
        { label: "Puzzle Training", to: "/puzzles" },
        { label: "Champion Challenge", to: "/champion-challenge" },
        { label: "Leaderboard", to: "/leaderboard" },
      ],
    },
    {
      title: "Watch",
      links: [
        { label: "World Championship 2026", to: "/world-championship-2026" },
        { label: "Live Events", to: "/live-events" },
        { label: "Tournament Schedule", to: "/world-championship-cycle" },
        { label: "Candidates 2026", to: "/candidates-2026" },
      ],
    },
    {
      title: "Learn",
      links: [
        { label: "Opening Trainer", to: "/openings" },
        { label: "Explain a Position", to: "/explain" },
        { label: "Game Analysis", to: "/analysis" },
        { label: "World Champions", to: "/champions" },
        { label: "Champions List", to: "/champions/list" },
        { label: "News & Articles", to: "/news" },
      ],
    },
    {
      title: "About",
      links: [
        { label: "Premium", to: "/premium" },
        { label: "Contact", to: "/contact" },
        { label: "Credits", to: "/credits" },
        { label: "Privacy Policy", to: "/privacy" },
        { label: "Terms of Service", to: "/terms" },
        { label: "Refund Policy", to: "/refund-policy" },
      ],
    },
  ];

  return (
    <footer data-site-footer className="border-t border-border/50 mt-auto">
      <div data-footer-container className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        {/* Footer grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6 sm:gap-8 mb-10">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            {/*
              THE BRAND SITS ON THE COLUMN TITLES' LINE (owner, 2026-08-15: *"move
              the logo and the king crown icon at the bottom of the page a bit
              higher so it will be aligned with the rest of the titles"*).

              Both rows START at the same y — measured 373 — so nothing was
              mis-stacked. What differs is the ROW HEIGHT: the brand is an 18px
              wordmark centred in a 32px tile, while `Play`, `Watch`, `Learn` and
              `About` are a 20px line. Equal tops, unequal heights, so the
              wordmark's centre lands 6px below theirs and the eye reads the whole
              brand as dropped.

              An OPTICAL correction, which is why it is a negative margin rather
              than a layout change: the tile has to keep its size, and aligning
              the two centres is exactly what "aligned with the titles" means when
              one row is taller than the other. `sm:` only — below that the footer
              is a single column and there is nothing beside it to align to.
            */}
            <Link to="/" className="flex items-center gap-2 mb-4 sm:-mt-1.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <span className="text-sm">&#9812;</span>
              </div>
              <span className="font-playfair font-bold text-lg text-foreground">Chess Playbook</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your complete chess platform for playing, watching, and learning.
            </p>
            {/* The channel's videos (2026-11-25): a link a visitor can find on every page, counted. */}
            <a
              href={YOUTUBE_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => logGA4Event({ name: 'social_link_clicked', params: { network: 'youtube', from: 'footer' } })}
              className="mt-3 inline-flex items-center gap-2 min-h-[36px] py-1 text-sm text-muted-foreground hover:text-link transition-colors"
            >
              <Youtube className="h-4 w-4" aria-hidden />
              Watch us on YouTube
            </a>
          </div>

          {/* Link columns */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h4 className="font-semibold text-foreground text-sm mb-4">{section.title}</h4>
              <ul className="space-y-0.5 sm:space-y-1">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      /* The footer is one of the ways to Premium; counted with the others (#467 B6). */
                      onClick={link.to === '/premium' ? () => logGA4Event({ name: 'premium_link_clicked', params: { from: 'footer' } }) : undefined}
                      className="inline-flex items-center min-h-[36px] py-1 text-sm text-muted-foreground hover:text-link transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            &copy; {currentYear} {COMPANY.legalName}. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a href="/credits" className="hover:text-link transition-colors">Credits & Attribution</a>
            <a
              href="https://github.com/F3F4-146-148/chessplaybook-web"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-link transition-colors"
            >
              Source code
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
