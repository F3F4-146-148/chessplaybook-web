import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import lines from './puzzleCardLines.json';
import { PUZZLE_CARD_HEADLINES } from './puzzleCardSpeech';

// the card's headline texts moved to puzzleCardVoice.ts (#401 A1)
const source = ['../puzzles/hooks/usePuzzle.ts', '../puzzles/components/PuzzleLiveCard.tsx', '../puzzles/components/puzzleCardVoice.ts']
  .map((p) => readFileSync(resolve(__dirname, p), 'utf8')).join('\n');

describe('the puzzles card messages the Master reads aloud', () => {
  it('are still what the page shows (a reworded message would otherwise go silent)', () => {
    for (const text of PUZZLE_CARD_HEADLINES) {
      const shown = text.startsWith('White ') || text.startsWith('Black ')
        ? source.includes(`to move\``) // built from the side: \`${side} to move\`
        : source.includes(`'${text}'`);
      expect(shown, text).toBe(true);
    }
  });

  it('each has its recording in puzzleCardLines.json', () => {
    const texts = new Set(lines.map((l) => l.text));
    for (const text of PUZZLE_CARD_HEADLINES) expect(texts.has(text), text).toBe(true);
  });

  it('never voices a wrong move (owner rule: a mistake gets his face, never words)', () => {
    const texts = lines.map((l) => l.text);
    expect(texts.some((t) => /Incorrect|Keep going\.$/.test(t))).toBe(false);
  });
});
