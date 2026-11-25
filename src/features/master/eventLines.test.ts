import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { allEventLines, chosenEventLine, eventLine } from './eventLines';
import { memoryLineStore } from './lineChooser';
import puzzleLines from './puzzleLines.json';

describe('the Master event lines', () => {
  it('names every recording by the server key of its text (sha1, 16 hex)', () => {
    for (const { text, key } of allEventLines()) {
      expect(key).toBe(createHash('sha1').update(text).digest('hex').slice(0, 16));
    }
  });

  it('chooses a line per game and serves it from the voice folder', () => {
    const a = eventLine('win', 0);
    expect(a.text).toBe('Well played! You beat me.');
    expect(a.audioUrl).toMatch(/^\/audio\/master-v3\/[0-9a-f]{16}\.mp3$/);
    expect(a.cuesUrl).toBe(a.audioUrl.replace(/\.mp3$/, '.json'));
    expect(eventLine('win', 3).text).toBe(a.text);
    expect(eventLine('draw', 1).text).toBe('A draw. A fair result.');
  });

  it('a game keeps its line, and the next game never repeats it (#401 B5)', () => {
    const store = memoryLineStore();
    let prev: string | null = null;
    for (let game = 1; game <= 30; game++) {
      const a = chosenEventLine('start', game, { store });
      expect(chosenEventLine('start', game, { store })).toBe(a); // the same game: the same line
      expect(a.audioUrl).toMatch(/^\/audio\/master-v3\/[0-9a-f]{16}\.mp3$/);
      expect(a.text).not.toBe(prev);
      prev = a.text;
    }
  });

  it('names every puzzles-card recording by the server key of its text too (#298)', () => {
    for (const { text, key } of Object.values(puzzleLines).flat()) {
      expect(key).toBe(createHash('sha1').update(text).digest('hex').slice(0, 16));
    }
  });

  it('never uses an em dash (owner rule for UI copy)', () => {
    for (const { text } of allEventLines()) expect(text).not.toMatch(/—/);
  });
});
