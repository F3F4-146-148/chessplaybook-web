/**
 * THE MASTER'S PICTURES (MASTER_CHARACTER_IMPLEMENTATION_PLAN A1, #186).
 *
 * Made by the owner in ChatGPT (six poses), cut out and cropped by `scripts/master-character/cutout.py`.
 * `assets/` is cached immutable for a year, so a changed picture goes in a NEW folder (`master-v2/`) and
 * this base changes with it; never overwrite a file in a published `master-vN/`.
 *
 * Every name this module can return is checked to exist by `masterAssets.test.ts`, so a missing picture
 * fails the build instead of a visitor's page.
 */

// v2 (2026-11-16): the after-move face (presenting, speaking) re-framed like Thinking and turned 18 deg, after
// master-v1 was live; v1 stays on the host for pages already open
export const MASTER_ASSET_BASE = '/assets/master-v2/';

export const MASTER_EXPRESSIONS = ['presenting', 'speaking', 'thinking', 'pleased', 'serious', 'surprised'] as const;
export type MasterExpression = (typeof MASTER_EXPRESSIONS)[number];

/** `head`: head and shoulders (cards with little room); `half`: half body (big empty bands). */
export type MasterVariant = 'head' | 'half';

/** The widths each variant is exported at, in pixels (the pictures are square). */
export const MASTER_WIDTHS: Record<MasterVariant, readonly number[]> = {
  head: [56, 112, 224],
  half: [300, 600],
};

/**
 * The side the board is on, seen from the Master. The pictures are drawn turning LEFT, so in a card to the
 * right of the board they are used as made; in a card to the left they are mirrored (owner, 2026-11-15:
 * "he always faces the board").
 */
export type MasterFacing = 'left' | 'right';

export function masterSrc(expression: MasterExpression, variant: MasterVariant, width: number, facing: MasterFacing): string {
  return `${MASTER_ASSET_BASE}master-${expression}-${variant}-${width}${facing === 'right' ? '-mirror' : ''}.webp`;
}

/**
 * The 1x picture is the smallest export at least as wide as the drawn size; the 2x the smallest at least twice
 * as wide (or the largest there is).
 */
export function masterSrcSet(expression: MasterExpression, variant: MasterVariant, size: number, facing: MasterFacing) {
  const widths = MASTER_WIDTHS[variant];
  const pick = (want: number) => widths.find((w) => w >= want) ?? widths[widths.length - 1];
  const one = pick(size);
  const two = pick(size * 2);
  return {
    src: masterSrc(expression, variant, one, facing),
    srcSet: one === two
      ? masterSrc(expression, variant, one, facing)
      : `${masterSrc(expression, variant, one, facing)} 1x, ${masterSrc(expression, variant, two, facing)} 2x`,
  };
}
