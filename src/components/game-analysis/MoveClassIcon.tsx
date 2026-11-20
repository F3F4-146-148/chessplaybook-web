/**
 * The move-class icon (#374, plan A3): a disc in the class's colour role with a mark.
 *
 * One drawn set, no emoji (the Good class was a thumbs-up emoji, rendered differently
 * by each operating system), and Severe Blunder has its own mark (it shared "??"
 * with Blunder). The mark is the page background colour on the disc, a pair the
 * contrast guard already holds at 4.5:1 in both themes ("background text on
 * move-* badge" in contrast.test.ts). The class name is always written beside it, so
 * the icon is never the only carrier of meaning.
 */
import type { ClassKey } from './reportView';

const DISC: Record<ClassKey, string> = {
  brilliant: 'bg-move-brilliant',
  best: 'bg-move-best',
  excellent: 'bg-move-excellent',
  good: 'bg-move-good',
  inaccuracy: 'bg-move-inaccuracy',
  mistake: 'bg-move-mistake',
  blunder: 'bg-move-blunder',
  severe_blunder: 'bg-move-severe-blunder',
};

const TEXT_MARK: Partial<Record<ClassKey, string>> = {
  brilliant: '!!', excellent: '!', inaccuracy: '?!', mistake: '?', blunder: '??', severe_blunder: '???',
};

export function MoveClassIcon({ classKey, size = 20 }: { classKey: ClassKey; size?: number }) {
  const mark = TEXT_MARK[classKey];
  const glyph = Math.round(size * 0.6);
  return (
    <span
      aria-hidden
      data-class-icon={classKey}
      className={`inline-grid shrink-0 place-items-center rounded-full font-extrabold leading-none tracking-tighter text-background ${DISC[classKey]}`}
      style={{ width: size, height: size, fontSize: Math.round(size * (mark && mark.length > 2 ? 0.42 : 0.5)) }}
    >
      {classKey === 'best' && (
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="currentColor">
          <path d="m12 2 3 6.6 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.2l1.5-7L2 9.4l7-.8z" />
        </svg>
      )}
      {classKey === 'good' && (
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      )}
      {mark}
    </span>
  );
}
