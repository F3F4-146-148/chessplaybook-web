import { MasterPortrait } from '@/components/master/MasterPortrait';
import type { MasterExpression } from '@/components/master/masterAssets';
import type { MasterSpeech } from '@/components/master/speech';
import { MasterVoiceButton } from '@/features/master/MasterVoiceButton';
import type { useMasterVoice } from '@/features/master/useMasterVoice';

/**
 * THE MASTER ON /play (MASTER_CHARACTER_IMPLEMENTATION_PLAN D4, #186).
 *
 * Two forms, both inside the Play computer card, which never changes size:
 *
 * - `invitation`: before a game. In columns his half body fills the card's empty band (it is the band, so it can
 *   never overflow it) with his line above; stacked (a phone) his face and line sit at the top of the band, the
 *   only part a visitor sees without scrolling (owner rule 2, 2026-11-15).
 * - `strip`: during and after a game, a row of FIXED height above the move list: his face and his current line.
 *   The row's height does not depend on the line, so a new line never moves the list.
 *
 * He is in the right lane, so the pictures are used as made (he turns left, to the board). With "Show the Master"
 * off the picture goes and his words stay, as the plan says.
 */
export interface MasterStripProps {
  expression: MasterExpression;
  line: string;
  show: boolean;
  variant: 'invitation' | 'strip';
  stacked: boolean;
  /** The voice (D8): shown in the game strip only. `speech` is the playing recording and its mouth cues (#298). */
  voice?: Pick<ReturnType<typeof useMasterVoice>, 'on' | 'toggle' | 'volume' | 'setVolume' | 'commitVolume'> & { speech: MasterSpeech | null };
}

const STRIP_FACE = { columns: 64, stacked: 52 };

export function MasterStrip({ expression, line, show, variant, stacked, voice }: MasterStripProps) {
  if (variant === 'invitation' && !stacked) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center" style={{ gap: 'var(--card-air)' }} data-master="invitation">
        <p className="self-stretch rounded-[0.6em] bg-muted px-[0.7em] py-[0.4em] text-[0.92em] text-foreground">{line}</p>
        {show && (
          <div className="flex min-h-0 w-full flex-1 items-end justify-center">
            <HalfBody expression={expression} />
          </div>
        )}
      </div>
    );
  }

  const face = stacked ? STRIP_FACE.stacked : STRIP_FACE.columns;
  const size = variant === 'invitation' ? 96 : face;
  return (
    <div className="flex shrink-0 items-center" style={{ gap: 'calc(var(--card-air) * 2)', height: show ? size : '3.6em' }} data-master={variant}>
      {/* mirrored: the v4 heads turn away from the board as drawn (owner, 2026-11-17); the half body is not (his hand presents the board) */}
      {show && <MasterPortrait expression={expression} variant="head" facing="right" size={size} speech={voice?.speech} />}
      <p className="min-w-0 flex-1 rounded-[0.6em] bg-muted px-[0.7em] py-[0.4em] text-[0.92em] leading-snug text-foreground line-clamp-2">{line}</p>
      {voice && (
        <MasterVoiceButton
          voice={voice}
          className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          iconClassName="h-5 w-5"
        />
      )}
    </div>
  );
}

/** The half body, as large as the band allows: a square box whose side is the band's height, capped by its width. */
function HalfBody({ expression }: { expression: MasterExpression }) {
  return (
    <div className="relative aspect-square h-full max-h-full max-w-full" style={{ containerType: 'size' }}>
      <MasterPortrait expression={expression} variant="half" facing="left" size={600} className="!h-full !w-full" />
    </div>
  );
}
