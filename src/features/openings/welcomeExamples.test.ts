import { describe, expect, it } from 'vitest';
import { WELCOME_GOALS } from './welcome';
import { exampleFrame, goalExampleMs, sceneAt, WELCOME_EXAMPLES } from './welcomeExamples';

describe('the goals of the opening by example', () => {
  it('has one example per goal, in the goals order', () => {
    expect(WELCOME_EXAMPLES.length).toBe(WELCOME_GOALS.length);
  });

  it('plays every scene to its end with legal moves', () => {
    WELCOME_EXAMPLES.forEach((scenes, i) => scenes.forEach((scene, k) => {
      for (const s of scene.steps) expect(() => exampleFrame(i, k, s.at)).not.toThrow();
    }));
  });

  it('shows the queen taking on b7 in the sixth goal, as in the video', () => {
    const end = exampleFrame(5, 0, 10_000)!;
    expect(end.lastMove).toEqual(['b3', 'b7']);
    expect(end.fen.split(' ')[0].split('/')[1]).toContain('Q');
  });

  it('plays the sixth goal scenes in turn', () => {
    expect(sceneAt(5, 0)!.scene).toBe(0);
    expect(sceneAt(5, goalExampleMs(5) - 1)!.scene).toBe(2);
  });
});
