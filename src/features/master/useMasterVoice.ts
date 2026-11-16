import { useCallback, useEffect, useRef, useState } from 'react';

import { logGA4Event } from '@/services/analytics';

/**
 * THE MASTER'S VOICE ON /play (MASTER_CHARACTER_IMPLEMENTATION_PLAN D8, #186).
 *
 * Off until the player presses the speaker (owner, Q2: a page that talks unasked surprises people in public), and
 * remembered in this browser. Pressing it is also the user gesture iOS requires before a page may play sound. While
 * on, each new line of his plays its recording, served by the site itself (D7); a recording that is missing or
 * fails to load stays silent, and the text is always on the page. `speaking` is true while a recording plays, so
 * the picture can move his mouth.
 */
const KEY = 'cp_master_voice';

function stored(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useMasterVoice(line: { text: string; audioUrl: string } | null) {
  const [on, setOn] = useState(stored);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = useCallback(() => {
    setOn((was) => {
      const next = !was;
      try { window.localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* remembered for this visit only */ }
      logGA4Event({ name: 'master_voice_toggled', params: { enabled: next } });
      if (!next) audioRef.current?.pause();
      return next;
    });
  }, []);

  useEffect(() => {
    if (!on || !line?.audioUrl) return;
    const audio = new Audio(line.audioUrl);
    audioRef.current?.pause();
    audioRef.current = audio;
    const stop = () => setSpeaking(false);
    audio.addEventListener('playing', () => setSpeaking(true));
    audio.addEventListener('ended', stop);
    audio.addEventListener('pause', stop);
    audio.addEventListener('error', stop);
    audio.play().catch(stop);
    return () => {
      audio.pause();
      stop();
    };
  }, [on, line]);

  return { on, toggle, speaking };
}

/** While he speaks: closed and open mouth alternate, about six times a second. */
export function useMouth(speaking: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!speaking) { setOpen(false); return; }
    const t = setInterval(() => setOpen((o) => !o), 160);
    return () => clearInterval(t);
  }, [speaking]);
  return open;
}
