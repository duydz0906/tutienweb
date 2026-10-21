import type { HumanConfig } from 'humanforge/human';
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance, type Gender } from '@van-thuong/shared';

/** Local CC0 MakeHuman package: seven fitted hair meshes, six skin textures in 2K, fitted robes and PBR normal maps. */
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

const HAIR_MESH: Record<Appearance['hair'], string> = {
  long: 'long01', tied: 'ponytail01', bob: 'bob02', braid: 'braid01',
  bun: 'rehmanpolanski_hair_bun_brown', short: 'short01', cropped: 'short03',
};

/** Skin/rig/clothes are sex-specific, not just one mesh scaled differently. */
export function toHumanConfig(gender: Gender, raw: Appearance): Partial<HumanConfig> {
  const a = normalizeAppearance(raw ?? DEFAULT_APPEARANCE);
  const sex = gender === 'nam' ? 'male' : 'female';
  const skin = a.skinTone === 'light' ? 'caucasian' : a.skinTone === 'deep' ? 'african' : 'asian';
  const face: Record<string, number> = {
    oval: { headOval: 0.75, jaw: -0.12, cheekBones: 0.08 },
    round: { headRound: 0.75, faceFat: 0.26, jaw: -0.24 },
    angular: { headSquare: 0.66, jaw: 0.35, cheekBones: 0.28 },
    heart: { headHeart: 0.85, chinWidth: -0.25, cheekBones: 0.2 },
  }[a.face];
  return {
    gender: gender === 'nam' ? 1 : 0,
    age: 0.14,
    african: skin === 'african' ? 0.85 : 0.05,
    asian: skin === 'asian' ? 0.88 : 0.08,
    caucasian: skin === 'caucasian' ? 0.87 : 0.07,
    skin: `young_${skin}_${sex}`,
    skinTint: a.skinTone === 'bronze' ? '#ceaa90' : '#ffffff',
    eyes: 'brownlight', eyebrows: 'eyebrow001', eyelashes: 'eyelashes01',
    eyebrowColor: HAIR_HEX[a.hairColor],
    hair: HAIR_MESH[a.hair], hairColor: HAIR_HEX[a.hairColor],
    clothes: [gender === 'nam' ? 'jalabiya01' : 'dress_maxi01', 'shoes04'],
    garmentColors: { outfit: ROBE_HEX[a.robeColor] },
    // The SDK's height macro is calibrated to the realistic middle of the MakeHuman range.
    height: 0.36 + a.height * 0.29 + (gender === 'nam' ? 0.025 : 0),
    weight: 0.33 + a.build * 0.32,
    muscle: (gender === 'nam' ? 0.40 : 0.34) + a.build * 0.30,
    proportions: 0.55,
    detail: { ...face, shoulders: (a.build - 0.5) * 0.64, waist: (a.build - 0.5) * 0.42 },
  };
}
