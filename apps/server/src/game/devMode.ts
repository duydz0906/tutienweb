import { randomUUID } from 'node:crypto';
import { expForStage, ITEMS, MAX_REALM, ROOT_MULTIPLIER, SKILLS, normalizeHotbar, skillsForPath,
  type CharacterState, type DevModeBackup, type OwnCharacter } from '@van-thuong/shared';
import type { Identity } from '../auth.js';
import { isLocalDevIdentity } from '../localDev.js';
import { GOD_STAT } from './rules.js';

/** Stable instance ids for sandbox-only items; they must never survive a dev-mode revoke. */
export const isDevGrant = (instanceId: string) => instanceId.startsWith('dev-grant-') || instanceId.startsWith('dev-sample-');

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

/** Upgrade older dev saves once; keep a customized hotbar on later reconnects. */
export function equipDevLoadout(c: CharacterState): boolean {
  if (!c.devMode) return false;
  const before = JSON.stringify([c.path, c.learnedSkills, c.hotbar, c.devModeBackup]);
  // Old dev saves predate customizable paths, looks and inventory. Snapshot their
  // CURRENT data before giving any new skills or allowing any new dev-only edits.
  // A revoked old account still restores its original, unmodified legacy save.
  const backup = c.devModeBackup;
  if (backup) {
    if (backup.resources === undefined) backup.resources = structuredClone(c.resources);
    if (backup.contribution === undefined) backup.contribution = c.contribution;
    if (backup.path === undefined) backup.path = c.path;
    if (backup.gender === undefined) backup.gender = c.gender;
    if (backup.appearance === undefined) backup.appearance = structuredClone(c.appearance);
    if (backup.learnedSkills === undefined) backup.learnedSkills = [...c.learnedSkills];
    if (backup.hotbar === undefined) backup.hotbar = [...c.hotbar];
    // Dev sample items are granted below; never snapshot them into the restore copy.
    if (backup.inventory === undefined)
      backup.inventory = structuredClone(c.inventory.filter((item) => !isDevGrant(item.instanceId)));
    if (backup.equipment === undefined) backup.equipment = Object.fromEntries(Object.entries(structuredClone(c.equipment))
      .filter(([, instanceId]) => typeof instanceId !== 'string' || !isDevGrant(instanceId))) as CharacterState['equipment'];
    if (backup.stash === undefined) backup.stash = structuredClone(c.stash ?? []);
  }
  c.path ??= 'kiem';
  const skills = skillsForPath(c.path);
  c.learnedSkills = [...new Set([...c.learnedSkills, ...skills.map((skill) => skill.id)])];
  c.hotbar = normalizeHotbar(c.hotbar);
  if (c.hotbar.filter(Boolean).length < 2)
    c.hotbar = normalizeHotbar([SKILLS.spirit_cut.id, skills[1].id, skills[2].id, skills.at(-2)!.id, skills.at(-1)!.id]);
  // Dev sandbox also carries one of every flight item, so sky-riding can be tested without farming.
  const flightIds = Object.values(ITEMS).filter((item) => item.flight).map((item) => item.id);
  for (const itemId of flightIds) {
    if (!c.inventory.some((item) => item.itemId === itemId))
      c.inventory.push({ instanceId: `dev-grant-${itemId}`, itemId, acquiredAt: Date.now() });
  }
  if (!c.equipment.mount) {
    const sword = c.inventory.find((item) => item.itemId === 'flying_sword');
    if (sword) c.equipment.mount = sword.instanceId;
  }
  // Dev sandbox gets one sample of every flight item so the new mechanic can be tested without farming.
  for (const itemId of ['flying_sword', 'cloud_disc', 'wind_fire_wheel', 'cloud_crane_mount', 'ink_cloud', 'spirit_cloud']) {
    if (!c.inventory.some((owned) => owned.itemId === itemId))
      c.inventory.push({ instanceId: `dev-sample-${itemId}`, itemId, acquiredAt: Date.now() });
  }
  return before !== JSON.stringify([c.path, c.learnedSkills, c.hotbar, c.devModeBackup]);
}

/** The World checks both a verified Firebase admin identity AND MongoDB role before calling this. */
export function activateDevMode(c: CharacterState): boolean {
  if (c.devMode) return false;
  const backup: DevModeBackup = {
    root: structuredClone(c.root), realm: c.realm, minorStage: c.minorStage,
    cultivation: c.cultivation, totalCultivation: c.totalCultivation,
    hp: c.hp, mp: c.mp, maxHp: c.maxHp, maxMp: c.maxMp,
    resources: structuredClone(c.resources), contribution: c.contribution,
    path: c.path, gender: c.gender, appearance: structuredClone(c.appearance),
    learnedSkills: [...c.learnedSkills], hotbar: [...c.hotbar],
    inventory: structuredClone(c.inventory), equipment: structuredClone(c.equipment), stash: structuredClone(c.stash),
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
  equipDevLoadout(c);
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
  if (b.path !== undefined) c.path = b.path;
  if (b.gender) c.gender = b.gender;
  if (b.appearance) c.appearance = structuredClone(b.appearance);
  if (b.learnedSkills) c.learnedSkills = [...b.learnedSkills];
  if (b.hotbar) c.hotbar = normalizeHotbar(b.hotbar);
  if (b.inventory) c.inventory = structuredClone(b.inventory);
  if (b.equipment) c.equipment = structuredClone(b.equipment);
  if (b.stash) c.stash = structuredClone(b.stash);
  c.devMode = false;
  delete c.devModeBackup;
}
