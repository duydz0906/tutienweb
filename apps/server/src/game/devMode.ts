import { expForStage, MAX_REALM, ROOT_MULTIPLIER, type CharacterState, type DevModeBackup } from '@van-thuong/shared';
import { GOD_STAT } from './rules.js';

/** The World checks both a verified Firebase admin identity AND MongoDB role before calling this. */
export function activateDevMode(c: CharacterState): boolean {
  if (c.devMode) return false;
  const backup: DevModeBackup = {
    root: structuredClone(c.root), realm: c.realm, minorStage: c.minorStage,
    cultivation: c.cultivation, totalCultivation: c.totalCultivation,
    hp: c.hp, mp: c.mp, maxHp: c.maxHp, maxMp: c.maxMp,
  };
  c.devModeBackup = backup;
  c.devMode = true;
  c.realm = MAX_REALM;
  c.minorStage = 9;
  c.cultivation = expForStage(9);
  c.totalCultivation = Math.max(c.totalCultivation, expForStage(9) * MAX_REALM);
  c.root = {
    tier: 'hon_don', elements: ['kim', 'moc', 'thuy', 'hoa', 'tho', 'bang', 'phong', 'loi', 'am', 'quang'],
    multiplier: ROOT_MULTIPLIER.hon_don,
  };
  c.hp = c.mp = c.maxHp = c.maxMp = GOD_STAT;
  return true;
}

/** A revoked/removed admin cannot keep god stats merely by reconnecting with a player token. */
export function revokeDevMode(c: CharacterState): void {
  if (!c.devMode) return;
  const b = c.devModeBackup;
  if (!b || !Number.isSafeInteger(b.realm) || !Number.isFinite(b.maxHp) || !Number.isFinite(b.maxMp) || !b.root)
    throw new Error('Không thể khôi phục trạng thái trước dev mode; tài khoản cần quản trị viên kiểm tra.');
  c.root = b.root;
  c.realm = b.realm;
  c.minorStage = b.minorStage;
  c.cultivation = b.cultivation;
  c.totalCultivation = b.totalCultivation;
  c.maxHp = b.maxHp;
  c.maxMp = b.maxMp;
  c.hp = b.hp;
  c.mp = b.mp;
  c.devMode = false;
  delete c.devModeBackup;
}
