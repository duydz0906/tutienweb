import { expForStage, MAX_REALM, ROOT_MULTIPLIER, type CharacterState, type DevModeBackup, type OwnCharacter } from '@van-thuong/shared';
import type { Identity } from '../auth.js';
import { isLocalDevIdentity } from '../localDev.js';
import { GOD_STAT } from './rules.js';

export function hasDevPower(c: CharacterState, identity: Identity): boolean {
  return c.devMode && (identity.isAdmin || isLocalDevIdentity(identity));
}

/** Client-visible infinity is a projection, NOT a balance written to MongoDB or JSON saves. */
export function ownCharacter(c: CharacterState, identity: Identity): OwnCharacter {
  const { ownerUid: _uid, devModeBackup: _backup, ...data } = c;
  const god = hasDevPower(c, identity);
  return { ...data, devMode: god,
    hp: god ? GOD_STAT : c.hp, mp: god ? GOD_STAT : c.mp,
    maxHp: god ? GOD_STAT : c.maxHp, maxMp: god ? GOD_STAT : c.maxMp,
    resources: god ? { stones: GOD_STAT, herbs: GOD_STAT, ore: GOD_STAT, ink: GOD_STAT } : c.resources,
    contribution: god ? GOD_STAT : c.contribution, isAdmin: identity.isAdmin };
}

/** The World checks both a verified Firebase admin identity AND MongoDB role before calling this. */
export function activateDevMode(c: CharacterState): boolean {
  if (c.devMode) return false;
  const backup: DevModeBackup = {
    root: structuredClone(c.root), realm: c.realm, minorStage: c.minorStage,
    cultivation: c.cultivation, totalCultivation: c.totalCultivation,
    hp: c.hp, mp: c.mp, maxHp: c.maxHp, maxMp: c.maxMp,
    resources: structuredClone(c.resources), contribution: c.contribution,
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
  if (b.resources) c.resources = { ...b.resources };
  if (typeof b.contribution === 'number') c.contribution = b.contribution;
  c.devMode = false;
  delete c.devModeBackup;
}
