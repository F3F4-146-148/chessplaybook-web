import { describe, expect, it } from 'vitest';
import { asProgressMoment, MOMENT_AUDIO_BASE, momentVoiceLines, phraseAt, phrasesOf, READ_MIN_S, readingSteps, type ProgressMoment } from './progressMoment';

const moment = (over: Partial<ProgressMoment> = {}): ProgressMoment => ({
  puzzleId: 'p1', tryId: 't1', kind: 'first', why: 'atLevel', startRating: 1500, gain: 20,
  points: [1500, 1508, 1520], heading: 'Nice climb',
  lines: [
    { text: 'Have a look at your rating.', key: '0123456789abcdef', role: 'opening' },
    { text: 'That rook sacrifice on h7 was lovely, and it led to mate.', key: 'fedcba9876543210', role: 'remark' },
  ],
  ...over,
});

describe('the progress moment on the page (#418)', () => {
  it('takes a moment only for the puzzle it belongs to, and only whole', () => {
    expect(asProgressMoment(moment(), 'p1')).not.toBeNull();
    expect(asProgressMoment(moment(), 'p2')).toBeNull();
    expect(asProgressMoment(moment({ points: [1500] }), 'p1')).toBeNull();
    expect(asProgressMoment(moment({ lines: [] }), 'p1')).toBeNull();
    expect(asProgressMoment(moment({ lines: [{ text: 'x', key: 'not-a-key', role: 'close' }] }), 'p1')).toBeNull();
    expect(asProgressMoment(undefined, 'p1')).toBeNull();
  });

  it('plays its lines from the moment\'s own folder, never master-v3', () => {
    const v = momentVoiceLines(moment());
    expect(v[0].audioUrl).toBe(`${MOMENT_AUDIO_BASE}0123456789abcdef.mp3`);
    expect(v[0].cuesUrl).toBe(`${MOMENT_AUDIO_BASE}0123456789abcdef.json`);
    expect(MOMENT_AUDIO_BASE).not.toContain('master-v3');
  });

  it('cuts phrases at punctuation, as the server does', () => {
    expect(phrasesOf('That rook sacrifice on h7 was lovely, and it led to mate.'))
      .toEqual(['That rook sacrifice on h7 was lovely,', 'and it led to mate.']);
  });

  it('shows the phrase being said at the audio\'s time', () => {
    const ph = [{ text: 'One,', start: 0.05, end: 1 }, { text: 'two.', start: 1.2, end: 2 }];
    expect(phraseAt(ph, 0)).toBe('One,');
    expect(phraseAt(ph, 1.18)).toBe('two.');
    expect(phraseAt([], 1)).toBeNull();
  });

  it('reads at a pace, never under the minimum, from the line it was muted on', () => {
    const all = readingSteps(moment());
    expect(all.map((s) => s.text)).toEqual(['Have a look at your rating.', 'That rook sacrifice on h7 was lovely,', 'and it led to mate.']);
    expect(all.every((s) => s.ms >= READ_MIN_S * 1000)).toBe(true);
    expect(readingSteps(moment(), 1).map((s) => s.line)).toEqual([1, 1]);
  });
});
