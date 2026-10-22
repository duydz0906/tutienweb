import type { OwnCharacter } from '@van-thuong/shared';

/**
 * Dev tools are a LOCAL SANDBOX feature.
 *
 * The server already refuses to grant god power unless the session is the signed `npm run dev`
 * identity or a verified admin, so `character.devMode` is authoritative for gameplay. This helper
 * is the single gate for the *interface*: the Dev drawer, the teleport shortcuts and the "+1 cảnh
 * giới" buttons only render when the API says this browser was started by `npm run dev`, or when
 * a verified admin is explicitly using their own tools.
 *
 * A normal player logging in through the login screen therefore only ever sees the regular
 * panels, even if an old save still carries a `devMode` flag.
 */
export function canUseDevTools(character: Pick<OwnCharacter, 'devMode' | 'isAdmin'> | null, devSandbox: boolean): boolean {
  if (!character?.devMode) return false;
  return devSandbox || character.isAdmin === true;
}

/** Banner text for the hero card, so "sandbox" and "admin" are never confused. */
export function heroEyebrow(character: Pick<OwnCharacter, 'devMode' | 'isAdmin'>, devTools: boolean): string {
  if (character.isAdmin) return '✦ THIÊN ĐẠO CHỦ';
  if (devTools) return '✦ DEV SANDBOX';
  return 'ĐỆ TỬ VÂN THƯỢNG';
}
