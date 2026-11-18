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
/**
 * The opening trainer's own voice switch (#336, owner 2026-11-18: "a voice switch for the trainer only"). Until the
 * player chooses there, it follows the site-wide choice, so nobody's voice changes the day it ships.
 */
export const OPENINGS_VOICE_KEY = 'cp_master_voice_openings';

function stored(key: string): boolean {
  try {
    const own = window.localStorage.getItem(key);
    return (own ?? (key === KEY ? null : window.localStorage.getItem(KEY))) === '1';
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

/*
  NO SILENCE AROUND HIS WORDS (owner, 2026-11-18: after "Correct! Puzzle solved." and Show solution "it waits too
  much"). Every recording opens with ~0.3 s and closes with ~0.2-0.45 s of silence (Kokoro's own padding, measured
  on the files). The mouth cues say where the speech starts and ends (`X` is the closed mouth), so each recording
  starts just before its first word and counts as finished just after its last one. Without cues it plays whole.
*/
const LEAD_S = 0.04;
const TAIL_S = 0.06;

function speechSpan(cues: MouthCue[]): { from: number; to: number } | null {
  const spoken = cues.filter((c) => c.shape !== 'X');
  if (spoken.length === 0) return null;
  return { from: Math.max(0, spoken[0].start - LEAD_S), to: spoken[spoken.length - 1].end + TAIL_S };
}

/*
  LOADED BEFORE IT IS NEEDED: a page that knows what he will say next (the puzzles card: "Correct! Puzzle solved." and
  the solution line) loads those recordings and cues ahead, so he speaks the moment it happens instead of after a
  fetch. A preloaded element is used once; the next lines of a queue are loaded while the current one plays.
*/
const preloaded = new Map<string, HTMLAudioElement>();
const PRELOAD_MAX = 16;

/*
  AN AUDIO ELEMENT IS RELEASED WHEN IT IS DONE WITH (found 2026-11-18): an element that stopped mid-file, or was loaded
  ahead and never played, keeps fetching and holds its connection. Over HTTP/1.1 (the dev server) a browser has six
  per host, so after a few cut-off lines the page's next recording, and the next page, waited for ever. Removing the
  source and calling load() aborts the fetch.
*/
function release(a: HTMLAudioElement): void {
  try {
    a.pause();
    a.removeAttribute('src');
    a.load();
  } catch {
    /* already gone */
  }
}

/** Drops loaded-ahead recordings no longer wanted (a queue cut off before reaching them). */
function dropPreloaded(urls: readonly string[]): void {
  for (const u of urls) {
    const a = preloaded.get(u);
    if (a) { preloaded.delete(u); release(a); }
  }
}

export function preloadMasterLines(lines: readonly (VoicedLine | null | undefined)[]): void {
  for (const l of lines) {
    if (!l?.audioUrl || preloaded.has(l.audioUrl)) continue;
    try {
      const a = new Audio();
      a.preload = 'auto';
      a.src = l.audioUrl;
      preloaded.set(l.audioUrl, a);
    } catch {
      continue;
    }
    void loadCues(l.cuesUrl);
    if (preloaded.size > PRELOAD_MAX) dropPreloaded([preloaded.keys().next().value as string]);
  }
}

function takeAudio(url: string): HTMLAudioElement {
  const a = preloaded.get(url);
  if (a) {
    preloaded.delete(url);
    return a;
  }
  return new Audio(url);
}

/**
 * `line`: one line, or a few said in order (#298: the puzzles card says its headline, then the line under it). A new
 * value stops what he is saying and starts again, so pass a memoised value: a re-render must never restart him.
 */
export function useMasterVoice(
  line: VoicedLine | readonly VoicedLine[] | null,
  options?: { onEnd?: () => void; /** where on/off is remembered; the site-wide switch when absent (#336) */ voiceKey?: string },
) {
  const voiceKey = options?.voiceKey ?? KEY;
  const [on, setOn] = useState(() => stored(voiceKey));
  const onRef = useRef(on);
  onRef.current = on;
  const [volume, setVolumeState] = useState(storedVolume);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const [speaking, setSpeaking] = useState(false);
  const [speech, setSpeech] = useState<MasterSpeech | null>(null);
  /** #324: the line of the queue he is saying (kept through the short gap between lines), null when he is not. */
  const [lineIndex, setLineIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // called when he has said the whole of `line` (or could not say it), never when a new line cut him off
  const onEndRef = useRef(options?.onEnd);
  onEndRef.current = options?.onEnd;

  const toggle = useCallback(() => {
    setOn((was) => {
      const next = !was;
      try { window.localStorage.setItem(voiceKey, next ? '1' : '0'); } catch { /* remembered for this visit only */ }
      logGA4Event({ name: 'master_voice_toggled', params: { enabled: next, ...(voiceKey === KEY ? {} : { surface: 'opening_trainer' }) } });
      if (!next) audioRef.current?.pause();
      return next;
    });
  }, [voiceKey]);

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
    try { window.localStorage.setItem(voiceKey, '1'); } catch { /* remembered for this visit only */ }
    logGA4Event({ name: 'master_voice_toggled', params: { enabled: true, ...(voiceKey === KEY ? {} : { surface: 'opening_trainer' }) } });
  }, [voiceKey]);

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
    let tail: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { setSpeaking(false); setSpeech(null); };
    // the next line after a short gap; the end of the queue at once (Show solution's board waits on it)
    const next = (i: number) => {
      if (i + 1 >= queue.length) { setLineIndex(null); if (live) onEndRef.current?.(); return; }
      gap = setTimeout(() => say(i + 1), BETWEEN_LINES_MS);
    };
    const say = (i: number) => {
      if (!live) return;
      if (i >= queue.length) { onEndRef.current?.(); return; }
      const current = takeAudio(queue[i].audioUrl);
      current.volume = volumeRef.current;
      audioRef.current?.pause();
      audioRef.current = current;
      audio = current;
      preloadMasterLines(queue.slice(i + 1, i + 3));
      let cues: MouthCue[] = [];
      let span: { from: number; to: number } | null = null;
      let done = false;
      const finish = () => {
        if (done || !live || audio !== current) return;
        done = true;
        clearTimeout(tail);
        release(current); // it stops after the last word: the rest of the file is not fetched
        stop();
        next(i);
      };
      // counts as finished just after the last word, not at the end of the trailing silence
      const scheduleTail = () => {
        clearTimeout(tail);
        if (!span || current.paused) return;
        tail = setTimeout(finish, Math.max(0, (span.to - current.currentTime) * 1000 / (current.playbackRate || 1)));
      };
      current.addEventListener('playing', () => { setSpeaking(true); setSpeech({ audio: current, cues }); setLineIndex(i); scheduleTail(); });
      current.addEventListener('ended', finish);
      current.addEventListener('pause', () => { clearTimeout(tail); if (!current.ended && !done) stop(); });
      current.addEventListener('error', () => { if (done) return; done = true; stop(); say(i + 1); });
      // the cues come first (cached, and loading alongside the audio), so he starts at his first word
      void loadCues(queue[i].cuesUrl).then((c) => {
        if (!live || audio !== current) return;
        cues = c;
        span = speechSpan(c);
        if (span && span.to <= span.from) span = null;
        try { if (span && current.currentTime < span.from) current.currentTime = span.from; } catch { /* plays whole */ }
        current.play().catch(() => { if (audio !== current) return; done = true; stop(); if (live) onEndRef.current?.(); });
      });
    };
    say(0);
    return () => {
      live = false;
      clearTimeout(gap);
      clearTimeout(tail);
      if (audio) release(audio);
      dropPreloaded(queue.map((l) => l.audioUrl)); // the lines he did not reach
      stop();
      setLineIndex(null);
    };
  }, [on, line]);

  return { on, toggle, speaking, speech, volume, setVolume, commitVolume, lineIndex };
}
