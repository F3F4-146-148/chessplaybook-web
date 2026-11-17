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
// master-v1 was live. v3 (2026-11-16, Phase B): the presenting and speaking faces cut tighter (575, was 654), so
// his face is the size it is in Thinking (owner: on the puzzles card the start face "feels like we did a zoom
// out"). v4 (2026-11-17, #298 A4): all six poses redrawn upright by Codex so his mouth can follow his words, plus
// a plain 'talking' pose, and for each pose six mouth and two blink layers (made by
// `scripts/master-character/talk_layers.py`). Since #298 C1 the mouth layers move while he speaks, so 'speaking'
// (presenting with the "eh" mouth) is no longer drawn by /play; it stays for any page still holding it.
// Older folders stay on the host for pages already open.
import talkLayers from './talkLayers.json';

export const MASTER_ASSET_BASE = '/assets/master-v4/';

export const MASTER_EXPRESSIONS = ['presenting', 'speaking', 'thinking', 'pleased', 'serious', 'surprised', 'talking'] as const;
export type MasterExpression = (typeof MASTER_EXPRESSIONS)[number];

/** `head`: head and shoulders (cards with little room); `half`: half body (big empty bands). */
export type MasterVariant = 'head' | 'half';

/** The widths each variant is exported at, in pixels (the pictures are square). */
export const MASTER_WIDTHS: Record<MasterVariant, readonly number[]> = {
  head: [56, 112, 224],
  half: [300, 600],
};

/**
 * Which way the picture is used: `left` as made, `right` mirrored (with its layers). The owner's rule is that he
 * always faces the board (2026-11-15). The v1-v3 pictures were drawn turning LEFT; the v4 HEADS were redrawn turning
 * the other way, so the cards right of the board use them mirrored (owner, 2026-11-17: "turned to the left would be
 * even better"). The v4 half bodies still present the board with the hand on the left and are used as made.
 */
export type MasterFacing = 'left' | 'right';

export function masterSrc(expression: MasterExpression, variant: MasterVariant, width: number, facing: MasterFacing): string {
  return `${MASTER_ASSET_BASE}master-${expression}-${variant}-${width}${facing === 'right' ? '-mirror' : ''}.webp`;
}

/**
 * The 1x picture is the smallest export at least as wide as the drawn size; the 2x the smallest at least twice
 * as wide (or the largest there is).
 */
export function masterWidths(variant: MasterVariant, size: number): { one: number; two: number } {
  const widths = MASTER_WIDTHS[variant];
  const pick = (want: number) => widths.find((w) => w >= want) ?? widths[widths.length - 1];
  return { one: pick(size), two: pick(size * 2) };
}

export function masterSrcSet(expression: MasterExpression, variant: MasterVariant, size: number, facing: MasterFacing) {
  const { one, two } = masterWidths(variant, size);
  return {
    src: masterSrc(expression, variant, one, facing),
    srcSet: one === two
      ? masterSrc(expression, variant, one, facing)
      : `${masterSrc(expression, variant, one, facing)} 1x, ${masterSrc(expression, variant, two, facing)} 2x`,
  };
}

/**
 * His small face for buttons (#298, owner 2026-11-17, option E then G): the after-move head cropped closer, hair
 * kept, the beard whole, so at ~32-36 px his face reads (the whole head at 22 px left his eyes ~6 px wide). Made by
 * `scripts/master-character/button_icon.py`. Still, never animated: on a button it would pull the eye.
 */
export const MASTER_ICON_WIDTHS = [36, 72, 108] as const;

export function masterIcon(): { src: string; srcSet: string } {
  const at = (w: number) => `${MASTER_ASSET_BASE}master-presenting-icon-b-${w}.webp`;
  return { src: at(36), srcSet: MASTER_ICON_WIDTHS.map((w, i) => `${at(w)} ${i + 1}x`).join(', ') };
}

/** The poses that have mouth and blink layers ('speaking' is a finished picture, not a pose). */
export const MASTER_POSES = ['talking', 'presenting', 'thinking', 'pleased', 'serious', 'surprised'] as const;
export type MasterPose = (typeof MASTER_POSES)[number];

/** Six mouths (rest is the pose itself) and two blink frames, drawn over the pose. */
export const MASTER_LAYERS = ['mouth-A', 'mouth-E', 'mouth-O', 'mouth-U', 'mouth-F', 'mouth-M', 'eyes-half', 'eyes-shut'] as const;
export type MasterLayer = (typeof MASTER_LAYERS)[number];

/** Where a layer sits on its pose's export: left, top, width, height in that export's pixels, unmirrored. */
type LayerBoxes = Record<MasterPose, Record<MasterLayer, Record<string, [number, number, number, number]>>>;
const LAYER_BOXES = talkLayers as unknown as LayerBoxes;

/**
 * A layer's picture and its box as fractions of the pose's square (so it scales with whatever size the pose is
 * drawn at). Mirrored, the box is flipped too.
 */
export function masterLayer(pose: MasterPose, layer: MasterLayer, variant: MasterVariant, width: number, facing: MasterFacing) {
  const [x, y, w, h] = LAYER_BOXES[pose][layer][`${variant}-${width}`];
  const left = facing === 'right' ? width - x - w : x;
  return {
    src: `${MASTER_ASSET_BASE}master-${pose}-${layer}-${variant}-${width}${facing === 'right' ? '-mirror' : ''}.webp`,
    left: left / width,
    top: y / width,
    width: w / width,
    height: h / width,
  };
}
