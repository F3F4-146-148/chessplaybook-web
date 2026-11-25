import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';

import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import * as PopoverPrimitive from '@radix-ui/react-popover';

import { HoverCardContent } from '@/components/ui/hover-card';
import { PopoverContent } from '@/components/ui/popover';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { volumeSettable, type useMasterVoice } from './useMasterVoice';

type Voice = Pick<ReturnType<typeof useMasterVoice>, 'on' | 'toggle' | 'volume' | 'setVolume' | 'commitVolume'>;

/**
 * THE MASTER'S SPEAKER, WITH ITS VOLUME (#310, #401), on /play's strip and the puzzles card.
 *
 * - Desktop (a mouse, and a browser that honours `audio.volume`): a click mutes or unmutes him; hovering the speaker
 *   opens a small slider beside it, drawn outside the card so the card's edges never cut it; Up / Down on the
 *   focused speaker change the level by 10%.
 * - A touch screen that honours `audio.volume` (Android, #401 A3, owner 2026-11-21: he was too loud on his phone and
 *   the phone's buttons were the only way down): with his voice off a tap turns him on, as before (it is also the
 *   press a browser needs before sound); with it on, a tap opens a small pop-up with the slider and Mute. Muting is
 *   two taps there.
 * - iPhone and iPad Safari ignore the volume a page sets: no slider anywhere (it would move and change nothing); a
 *   tap mutes and unmutes, and the phone's own buttons set the level.
 */
export function MasterVoiceButton({ voice, className, iconClassName, hidden }: {
  voice: Voice;
  className: string;
  iconClassName?: string;
  hidden?: boolean;
}) {
  const [desktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches && volumeSettable(),
  );
  // `any-pointer`: a touch laptop also has a mouse, and its finger still needs the pop-up
  const [touch] = useState(
    () => !desktop && typeof window !== 'undefined' && !!window.matchMedia?.('(any-pointer: coarse)').matches && volumeSettable(),
  );
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // muted from elsewhere (the other card, another control): nothing to adjust, so it closes
  useEffect(() => { if (!voice.on) setOpen(false); }, [voice.on]);

  const label = voice.on
    ? (touch ? "The Master's voice: volume and mute" : "Mute the Master's voice")
    : "Hear the Master's voice";
  const Icon = !voice.on ? VolumeX : voice.volume < 0.5 ? Volume1 : Volume2;
  const pct = Math.round(voice.volume * 100);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const next = Math.round((voice.volume + (e.key === 'ArrowUp' ? 0.1 : -0.1)) * 10) / 10;
    voice.setVolume(next);
    voice.commitVolume(Math.min(1, Math.max(0, next)));
  };

  const onClick = () => {
    if (touch && voice.on) setOpen((o) => !o);
    else voice.toggle();
  };

  const button = (
    <button
      ref={buttonRef}
      type="button"
      hidden={hidden}
      onClick={onClick}
      onKeyDown={desktop ? onKeyDown : undefined}
      aria-pressed={voice.on}
      aria-haspopup={touch && voice.on ? 'dialog' : undefined}
      aria-expanded={touch && voice.on ? open : undefined}
      aria-label={label}
      aria-keyshortcuts={desktop ? 'ArrowUp ArrowDown' : undefined}
      title={desktop ? `${label} (volume ${pct}%)` : label}
      className={className}
      data-master-voice=""
    >
      <Icon className={iconClassName} aria-hidden />
    </button>
  );
  if (hidden || (!desktop && !touch)) return button;

  if (touch) {
    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Anchor asChild>{button}</PopoverPrimitive.Anchor>
        {/* in a portal (PopoverContent), so the card's containment never places it or cuts it */}
        <PopoverContent
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={8}
          className="w-auto px-3 py-2"
          data-master-volume=""
          aria-label="The Master's voice"
          onOpenAutoFocus={(e) => e.preventDefault()}
          // the speaker is not "outside": its own tap closes the pop-up (onClick), it must not close and reopen it.
          // Both the press and the focus it moves count as outside, so both are stopped (a pointer-only guard failed).
          onInteractOutside={(e) => { if (buttonRef.current?.contains(e.target as Node)) e.preventDefault(); }}
          onCloseAutoFocus={(e) => { e.preventDefault(); buttonRef.current?.focus({ preventScroll: true }); }}
        >
          <div className="flex items-center gap-3">
            <VolumeSlider voice={voice} pct={pct} surface="touch_popup" />
            <button
              type="button"
              onClick={() => { setOpen(false); voice.toggle(); }}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-master-mute=""
            >
              Mute
            </button>
          </div>
        </PopoverContent>
      </PopoverPrimitive.Root>
    );
  }

  return (
    <HoverCardPrimitive.Root openDelay={120} closeDelay={250}>
      <HoverCardPrimitive.Trigger asChild>{button}</HoverCardPrimitive.Trigger>
      {/* in a portal: inside the card, the card's containment would place it and its edges would cut it */}
      <HoverCardPrimitive.Portal>
        <HoverCardContent side="top" align="center" sideOffset={6} collisionPadding={8} className="w-auto px-3 py-2" data-master-volume="">
          <VolumeSlider voice={voice} pct={pct} />
        </HoverCardContent>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}

/** "Volume", the slider and the level: the same on desktop and on touch screens. */
function VolumeSlider({ voice, pct, surface }: { voice: Voice; pct: number; surface?: 'touch_popup' }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-xs text-muted-foreground">Volume</span>
      <SliderPrimitive.Root
        // a finger needs a taller target than a mouse; the track stays the same
        className="relative flex h-6 w-28 touch-none select-none items-center"
        data-master-volume-track=""
        min={0}
        max={100}
        step={5}
        value={[pct]}
        onValueChange={([v]) => voice.setVolume(v / 100)}
        onValueCommit={([v]) => voice.commitVolume(v / 100, surface)}
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
  );
}
