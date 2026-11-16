import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { allEventLines, eventLine } from './eventLines';

describe('the Master event lines', () => {
  it('names every recording by the server key of its text (sha1, 16 hex)', () => {
    for (const { text, key } of allEventLines()) {
      expect(key).toBe(createHash('sha1').update(text).digest('hex').slice(0, 16));
    }
  });

  it('chooses a line per game and serves it from the voice folder', () => {
    const a = eventLine('win', 0);
    expect(a.text).toBe('Well played! You beat me.');
    expect(a.audioUrl).toMatch(/^\/audio\/master-v1\/[0-9a-f]{16}\.mp3$/);
    expect(eventLine('win', 3).text).toBe(a.text);
    expect(eventLine('draw', 1).text).toBe('A draw. A fair result.');
  });

  it('never uses an em dash (owner rule for UI copy)', () => {
    for (const { text } of allEventLines()) expect(text).not.toMatch(/—/);
  });
});
