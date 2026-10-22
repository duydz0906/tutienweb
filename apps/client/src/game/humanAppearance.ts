import type { Appearance } from '@van-thuong/shared';

/**
 * Palette shared by the character creator and the procedural body sculptor. These hex values are
 * the single source of truth for hair, robe and skin tints; the spline builders in `game/sculpt`
 * read them so the preview swatches always match the in-game character.
 */
export const HAIR_HEX: Record<Appearance['hairColor'], string> = {
  ink: '#201e26', silver: '#e1e0d8', chestnut: '#794637', auburn: '#ae5541',
  gold: '#d2aa70', ash: '#958e86', plum: '#815674', jade: '#57948c',
};
export const ROBE_HEX: Record<Appearance['robeColor'], string> = {
  ivory: '#e7ddc6', jade: '#61999b', ember: '#a86563', midnight: '#3c5671', lilac: '#a28ab7',
};
export const SKIN_HEX: Record<Appearance['skinTone'], string> = {
  light: '#f1d4bc', warm: '#dcb79b', bronze: '#bb8b67', deep: '#795344',
};
