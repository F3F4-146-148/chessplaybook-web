import { describe, expect, it } from 'vitest';
import { BETWEEN_LINES_S, START_FEN, buildTimeline, spokenSpan, type VideoLine } from './timeline';
import type { MouthCue } from '@/components/master/speech';

// a recording of 2 s: 0.3 s of silence, words from 0.3 to 1.6, silence to 2.0
const CUES: MouthCue[] = [
  { shape: 'X', start: 0, end: 0.3 },
  { shape: 'A', start: 0.3, end: 0.8 },
  { shape: 'M', start: 0.8, end: 1.0 },
  { shape: 'E', start: 1.0, end: 1.6 },
  { shape: 'X', start: 1.6, end: 2.0 },
];
const line = (text: string, extra: Partial<VideoLine> = {}): VideoLine => ({ text, key: text.slice(0, 4), cues: CUES, ...extra });

describe('spokenSpan', () => {
  it('starts 0.04 s before the first word and ends 0.06 s after the last, as the site plays it', () => {
    const s = spokenSpan(CUES);
    expect(s.from).toBeCloseTo(0.26, 6);
    expect(s.to).toBeCloseTo(1.66, 6);
  });
});

describe('buildTimeline', () => {
  const span = 1.66 - 0.26;

  it('places each line after the previous one with the site gap, and the clips match', () => {
    const tl = buildTimeline([{ kind: 'board', items: [line('one'), line('two')] }]);
    expect(tl.clips).toHaveLength(2);
    expect(tl.clips[0].at).toBe(0);
    expect(tl.clips[1].at).toBeCloseTo(span + BETWEEN_LINES_S, 6);
    expect(tl.duration).toBeCloseTo(2 * span + 2 * BETWEEN_LINES_S, 6);
    expect(tl.frames).toBe(Math.ceil(tl.duration * 30));
  });

  it('opens the mouth only while he speaks, on the recording\'s own cues', () => {
    const tl = buildTimeline([{ kind: 'board', items: [line('one')] }]);
    // t = 0.2 in the video is 0.46 in the recording (+0.03 lead): inside the 'A'
    expect(tl.frameAt(0.2).mouth).toBe('A');
    // in the pause after the line
    expect(tl.frameAt(span + 0.1).mouth).toBe('X');
  });

  it('plays the plies during the line and keeps the position after it', () => {
    const tl = buildTimeline([{ kind: 'board', items: [line('moves', { plies: ['d2d4', 'd7d5'] })] }]);
    expect(tl.frameAt(0).fen).not.toBe(START_FEN); // the first ply at the line's start
    expect(tl.frameAt(0).lastMove).toEqual(['d2', 'd4']);
    const after = tl.frameAt(tl.duration - 0.01);
    expect(after.fen.startsWith('rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w')).toBe(true);
    expect(after.lastMove).toEqual(['d7', 'd5']);
  });

  it('refuses an illegal move instead of drawing a wrong board', () => {
    expect(() => buildTimeline([{ kind: 'board', items: [line('bad', { plies: ['e2e5'] })] }])).toThrow(/illegal/);
  });

  it('continues the board into the next scene unless the scene sets a position', () => {
    const tl = buildTimeline([
      { kind: 'board', items: [line('a', { plies: ['e2e4'] })] },
      { kind: 'board', items: [line('b')] },
      { kind: 'board', fen: START_FEN, items: [line('c')] },
    ]);
    const second = tl.clips[1].at + 0.1;
    expect(tl.frameAt(second).fen).toContain('4P3');
    expect(tl.frameAt(tl.clips[2].at + 0.1).fen).toBe(START_FEN);
  });

  it('draws the marks of the line being said, as White before any move', () => {
    const tl = buildTimeline([{ kind: 'board', items: [line('centre', { marks: 'd4 e4' })] }]);
    const f = tl.frameAt(0.5);
    expect(f.marks).toBe('d4 e4');
    expect(f.mover).toBe('white');
    expect(f.caption).toBe('centre');
  });

  it('holds a card with no voice for its minimum length', () => {
    const tl = buildTimeline([{ kind: 'card', title: 'Hook', items: [], minDuration: 2 }, { kind: 'board', items: [line('x')] }]);
    expect(tl.frameAt(1).kind).toBe('card');
    expect(tl.frameAt(1).title).toBe('Hook');
    expect(tl.clips[0].at).toBe(2);
  });

  it('ticks one list item per line said', () => {
    const tl = buildTimeline([{ kind: 'board', list: { items: ['a', 'b'], tickPerLine: true }, items: [line('a'), line('b')] }]);
    expect(tl.frameAt(0.1).list?.ticked).toBe(1);
    expect(tl.frameAt(tl.clips[1].at + 0.1).list?.ticked).toBe(2);
  });

  it('a silent beat plays its move with no clip and shows its caption', () => {
    const tl = buildTimeline([{ kind: 'board', items: [{ silent: true, duration: 1, plies: ['e2e4'], caption: '1.e4' }] }]);
    expect(tl.clips).toHaveLength(0);
    expect(tl.frameAt(0.6).caption).toBe('1.e4');
    expect(tl.frameAt(0.6).mouth).toBe('X');
  });
});
