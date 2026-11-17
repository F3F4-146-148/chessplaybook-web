import { useState, type KeyboardEvent } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';

import * as HoverCardPrimitive from '@radix-ui/react-hover-card';

import { HoverCardContent } from '@/components/ui/hover-card';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { volumeSettable, type useMasterVoice } from './useMasterVoice';

/**
 * THE MASTER'S SPEAKER, WITH ITS VOLUME (#310), on /play's strip and the puzzles card.
 *
 * A click mutes or unmutes him, as before. On a desktop (a mouse, and a browser that honours `audio.volume`) hovering
 * the speaker opens a small slider beside it, drawn outside the card so the card's edges never cut it, and Up / Down
 * on the focused speaker change the level by 10%. On phones and tablets there is no slider: iPhone and iPad Safari
 * ignore the volume a page sets, so a slider there would move and change nothing; the device's own buttons do it.
 */
export function MasterVoiceButton({ voice, className, iconClassName, hidden }: {
  voice: Pick<ReturnType<typeof useMasterVoice>, 'on' | 'toggle' | 'volume' | 'setVolume' | 'commitVolume'>;
  className: string;
  iconClassName?: string;
  hidden?: boolean;
}) {
  const [desktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches && volumeSettable(),
  );
  const label = voice.on ? "Mute the Master's voice" : "Hear the Master's voice";
  const Icon = !voice.on ? VolumeX : voice.volume < 0.5 ? Volume1 : Volume2;
  const pct = Math.round(voice.volume * 100);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const next = Math.round((voice.volume + (e.key === 'ArrowUp' ? 0.1 : -0.1)) * 10) / 10;
    voice.setVolume(next);
    voice.commitVolume(Math.min(1, Math.max(0, next)));
  };

  const button = (
    <button
      type="button"
      hidden={hidden}
      onClick={voice.toggle}
      onKeyDown={desktop ? onKeyDown : undefined}
      aria-pressed={voice.on}
      aria-label={label}
      aria-keyshortcuts={desktop ? 'ArrowUp ArrowDown' : undefined}
      title={desktop ? `${label} (volume ${pct}%)` : label}
      className={className}
      data-master-voice=""
    >
      <Icon className={iconClassName} aria-hidden />
    </button>
  );
  if (!desktop || hidden) return button;

  return (
    <HoverCardPrimitive.Root openDelay={120} closeDelay={250}>
      <HoverCardPrimitive.Trigger asChild>{button}</HoverCardPrimitive.Trigger>
      {/* in a portal: inside the card, the card's containment would place it and its edges would cut it */}
      <HoverCardPrimitive.Portal>
        <HoverCardContent side="top" align="center" sideOffset={6} collisionPadding={8} className="w-auto px-3 py-2" data-master-volume="">
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-muted-foreground">Volume</span>
            <SliderPrimitive.Root
              className="relative flex h-5 w-28 touch-none select-none items-center"
              data-master-volume-track=""
              min={0}
              max={100}
              step={5}
              value={[pct]}
              onValueChange={([v]) => voice.setVolume(v / 100)}
              onValueCommit={([v]) => voice.commitVolume(v / 100)}
            >
              <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
                <SliderPrimitive.Range className="absolute h-full bg-primary" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb
                aria-label="The Master's voice volume"
                className="block h-4 w-4 rounded-full border-2 border-primary bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </SliderPrimitive.Root>
            <span className="w-9 text-right text-xs tabular-nums text-foreground">{pct}%</span>
          </div>
        </HoverCardContent>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}
