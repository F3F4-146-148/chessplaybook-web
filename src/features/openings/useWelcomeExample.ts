import { useEffect, useMemo, useState } from 'react';
import { exampleFrame, sceneAt, SCENE_HOLD_MS, WELCOME_EXAMPLES, type ExampleFrame } from './welcomeExamples';

/**
 * The board for the goal being shown on the welcome (welcomeExamples.ts): its scenes played from the moment the goal
 * became the shown one, step by step. `goal` null shows nothing (the starting position stays). The last scene holds
 * once it is over.
 */
export function useWelcomeExample(goal: number | null): ExampleFrame | null {
  // the time is the goal's own: a new goal reads 0 from its first render, not the last goal's time
  const [clock, setClock] = useState<{ goal: number | null; t: number }>({ goal, t: 0 });
  const t = clock.goal === goal ? clock.t : 0;
  useEffect(() => {
    if (goal === null || !WELCOME_EXAMPLES[goal]) return;
    // every moment something changes: each step of each scene, at its time from the goal's start
    const times: number[] = [];
    let start = 0;
    for (const scene of WELCOME_EXAMPLES[goal]) {
      for (const s of scene.steps) if (s.at > 0) times.push(start + s.at);
      const last = scene.steps.length ? scene.steps[scene.steps.length - 1].at : 0;
      start += last + SCENE_HOLD_MS;
      times.push(start);
    }
    const timers = times.map((ms) => setTimeout(() => setClock({ goal, t: ms }), ms));
    return () => timers.forEach(clearTimeout);
  }, [goal]);
  return useMemo(() => {
    if (goal === null) return null;
    const at = sceneAt(goal, t);
    return at ? exampleFrame(goal, at.scene, at.at) : null;
  }, [goal, t]);
}
