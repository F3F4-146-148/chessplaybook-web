import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { featureCards } from '@/config/featureCards';
import { logGA4Event } from '@/services/analytics';

/**
 * The six chooser cards in design v2: flat glass over the hero photo, gold icons, serif titles, a round arrow.
 *
 * THE CHOOSER CONTRACT IS UNCHANGED (HOMEPAGE_CHOICE_ARCHITECTURE_ANALYSIS; Features.tsx): the same six
 * destinations from `featureCards.ts`, in the same order, all inside the first phone screen, and
 * `home_choice_click { to, position }` exactly as today. What changed is presentation only, and the chooser is
 * recorded as a changed stimulus on the switch date (plan D3).
 *
 * A `secondary` card is the quieter one, its icon muted rather than gold (owner D5). News was that card until it
 * left the grid on 2026-11-13 for the Opening Trainer; no card uses the tier now, so every icon is gold.
 */
export function ChooserGrid({ className = '' }: { className?: string }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 ${className}`}>
      {featureCards.map((f, index) => (
        <Link
          key={f.href}
          to={f.href}
          onClick={() => logGA4Event({ name: 'home_choice_click', params: { to: f.href, position: index } })}
          className="group v2-card-glass relative flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-5 p-3 md:p-4 lg:px-6 h-[96px] md:h-auto md:min-h-[100px] lg:py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:-translate-y-0.5 active:translate-y-px"
        >
          {/* A ROW (icon, text, arrow) only from 1024px. A tablet's three columns are ~230px, and a row left the
              text 52-137px: titles over the arrow, every description clipped (#236, measured). There the card
              stacks like a phone's, with the full title and the whole description. */}
          <f.icon
            className={`w-7 h-7 md:w-9 md:h-9 lg:w-10 lg:h-10 shrink-0 ${f.tier === 'secondary' ? 'text-muted-foreground' : 'v2-gold-icon text-link'}`}
            {...({ strokeWidth: 1.5 } as object)}
          />
          <div className="min-w-0 flex-1 mt-auto md:mt-0">
            <h2 className="font-playfair font-semibold text-[18px] md:text-[21px] lg:text-[23px] leading-tight">
              <span className="md:hidden">{f.shortTitle ?? f.title}</span>
              <span className="hidden md:inline">{f.title}</span>
            </h2>
            <p className="hidden md:block text-[13px] text-muted-foreground leading-snug mt-1">{f.description}</p>
          </div>
          <span className="v2-arrow v2-arrow-lg absolute top-3 right-3 md:top-4 md:right-4 lg:static" aria-hidden>
            <ArrowRight className="w-[18px] h-[18px] md:w-5 md:h-5" strokeWidth={2.5} />
          </span>
        </Link>
      ))}
    </div>
  );
}
