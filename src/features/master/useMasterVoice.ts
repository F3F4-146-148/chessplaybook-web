import { useCallback, useEffect, useRef, useState } from 'react';

import type { MasterSpeech, MouthCue } from '@/components/master/speech';
import { logGA4Event } from '@/services/analytics';

/**
 * THE MASTER'S VOICE ON /play (MASTER_CHARACTER_IMPLEMENTATION_PLAN D8, #186; mouth cues TALKING_MASTER C3, #298).
 *
 * Off until the player presses the speaker (owner, Q2: a page that talks unasked surprises people in public), and
 * remembered in this browser. Pressing it is also the user gesture iOS requires before a page may play sound. While
 * on, each new line of his plays its recording, served by the site itself (D7); a recording that is missing or
 * fails to load stays silent, and the text is always on the page. `speaking` is true while a recording plays, and
 * `speech` hands the playing audio and its mouth cues to the portrait, so his mouth follows the words. Cues that
 * fail to load leave his mouth closed while the voice plays.
 */
const KEY = 'cp_master_voice';

function stored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/*
  THE VOLUME (#310). One level for the whole site, remembered in this browser, 0 to 1 (default full). It is applied to
  each recording as it starts and to the one playing when it changes. iPhone and iPad Safari ignore `audio.volume`
  (it stays 1 whatever is set), so the slider is offered only where setting it works: `volumeSettable()`.
*/
const VOLUME_KEY = 'cp_master_volume';

function storedVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(VOLUME_KEY));
    return window.localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
}

let settable: boolean | null = null;

/** Whether this browser lets a page set an audio element's volume (read back after setting: Safari on iOS keeps 1). */
export function volumeSettable(): boolean {
  if (settable !== null) return settable;
  try {
    const probe = new Audio();
    probe.volume = 0.5;
    settable = Math.abs(probe.volume - 0.5) < 0.01;
  } catch {
    settable = false;
  }
  return settable;
}

const cueCache = new Map<string, Promise<MouthCue[]>>();

function loadCues(url: string | undefined): Promise<MouthCue[]> {
  if (!url) return Promise.resolve([]);
  let p = cueCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    cueCache.set(url, p);
  }
  return p;
}

type VoicedLine = { text: string; audioUrl: string; cuesUrl?: string };

/** Between two lines said one after the other (the puzzles card's headline, then the line under it). */
const BETWEEN_LINES_MS = 200;

/**
 * `line`: one line, or a few said in order (#298: the puzzles card says its headline, then the line under it). A new
 * value stops what he is saying and starts again, so pass a memoised value: a re-render must never restart him.
 */
export function useMasterVoice(line: VoicedLine | readonly VoicedLine[] | null, options?: { onEnd?: () => void }) {
  const [on, setOn] = useState(stored);
  const onRef = useRef(on);
  onRef.current = on;
  const [volume, setVolumeState] = useState(storedVolume);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const [speaking, setSpeaking] = useState(false);
  const [speech, setSpeech] = useState<MasterSpeech | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // called when he has said the whole of `line` (or could not say it), never when a new line cut him off
  const onEndRef = useRef(options?.onEnd);
  onEndRef.current = options?.onEnd;

  const toggle = useCallback(() => {
    setOn((was) => {
      const next = !was;
      try { window.localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* remembered for this visit only */ }
      logGA4Event({ name: 'master_voice_toggled', params: { enabled: next } });
      if (!next) audioRef.current?.pause();
      return next;
    });
  }, []);

  /**
   * Sets the level and applies it to the line playing. Moving it while he is muted turns his voice on (the slider is
   * then the user gesture a browser needs before sound); moving it to 0 does not mute him, it is only quiet.
   */
  const setVolume = useCallback((next: number) => {
    const v = Math.min(1, Math.max(0, next));
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
    try { window.localStorage.setItem(VOLUME_KEY, String(v)); } catch { /* remembered for this visit only */ }
    if (onRef.current || v === 0) return;
    onRef.current = true;
    setOn(true);
    try { window.localStorage.setItem(KEY, '1'); } catch { /* remembered for this visit only */ }
    logGA4Event({ name: 'master_voice_toggled', params: { enabled: true } });
  }, []);

  /** The level chosen, reported once when the slider is let go (not on every step of a drag). */
  const commitVolume = useCallback((v: number) => {
    logGA4Event({ name: 'master_voice_volume_set', params: { volume: Math.round(v * 100) } });
  }, []);

  useEffect(() => {
    const queue = (line === null ? [] : Array.isArray(line) ? line : [line as VoicedLine]).filter((l) => l.audioUrl);
    if (!on || queue.length === 0) return;
    let live = true;
    let audio: HTMLAudioElement | null = null;
    let gap: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { setSpeaking(false); setSpeech(null); };
    const say = (i: number) => {
      if (!live) return;
      if (i >= queue.length) { onEndRef.current?.(); return; }
      const current = new Audio(queue[i].audioUrl);
      current.volume = volumeRef.current;
      audioRef.current?.pause();
      audioRef.current = current;
      audio = current;
      let cues: MouthCue[] = [];
      void loadCues(queue[i].cuesUrl).then((c) => {
        if (!live || audio !== current) return;
        cues = c;
        if (!current.paused) setSpeech({ audio: current, cues });
      });
      current.addEventListener('playing', () => { setSpeaking(true); setSpeech({ audio: current, cues }); });
      current.addEventListener('ended', () => { stop(); gap = setTimeout(() => say(i + 1), BETWEEN_LINES_MS); });
      current.addEventListener('pause', () => { if (!current.ended) stop(); });
      current.addEventListener('error', () => { stop(); say(i + 1); });
      current.play().catch(() => { stop(); if (live) onEndRef.current?.(); });
    };
    say(0);
    return () => {
      live = false;
      clearTimeout(gap);
      audio?.pause();
      stop();
    };
  }, [on, line]);

  return { on, toggle, speaking, speech, volume, setVolume, commitVolume };
}
