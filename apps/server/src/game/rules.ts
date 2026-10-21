import { randomInt, randomUUID } from 'node:crypto';
import {
  CONSUMABLES, DEFAULT_APPEARANCE, EQUIPMENT_SLOTS, FACE_SHAPES, HAIR_COLORS,
  HAIR_STYLES, ITEMS, LEVEL_CONFIG, majorBreakthroughCost, MAX_REALM, ROBE_COLORS, ROOT_MULTIPLIER, SKIN_TONES, expForStage,
  HOME_CHEST, REBIRTH_ALTAR, absorptionMultiplier, inSpiritLake, storageCapacity,
  type Appearance, type CharacterState, type Element, type EquipmentSlot,
  type Gender, type SpiritRoot, type Vector3, type WorldZone,
} from '@van-thuong/shared';

const COMMON_ELEMENTS: Element[] = ['kim', 'moc', 'thuy', 'hoa', 'tho'];
const MUTATED_ELEMENTS: Element[] = ['bang', 'phong', 'loi', 'am', 'quang'];
export const GOD_STAT = 999_999_999;
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const WORLD_RADIUS = 45;
export const TRIAL_RADIUS = 17;
export const PRIVATE_RADIUS = 8.5;

/** Integer draw has no floating-point bias: 6000 + 3000 + 900 + 100 = 10000. */
export function rollSpiritRoot(draw: (max: number) => number = randomInt): SpiritRoot {
  const roll = draw(10_000);
  if (!Number.isInteger(roll) || roll < 0 || roll >= 10_000) throw new Error('Invalid RNG draw');
  const tier = roll < 6000 ? 'tap' : roll < 9000 ? 'chan' : roll < 9900 ? 'thien' : 'bien_di';
  const source = tier === 'bien_di' ? MUTATED_ELEMENTS : COMMON_ELEMENTS;
  const count = tier === 'tap' ? 4 : tier === 'chan' ? 2 : 1;
  const available = [...source];
  const elements: Element[] = [];
  for (let i = 0; i < count; i++) elements.push(available.splice(draw(available.length), 1)[0]);
  return { tier, elements, multiplier: ROOT_MULTIPLIER[tier] };
}

/** The same strict allowlist guards creation and later appearance updates. */
export function parseAppearance(raw: unknown): Appearance {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ngoại hình không hợp lệ.');
  const a = raw as Record<string, unknown>;
  const option = <T extends string>(values: readonly T[], key: string, fallback: T): T => {
    if (a[key] === undefined) return fallback; // pre-upgrade clients and saved characters
    const match = values.find((value) => value === a[key]);
    if (!match) throw new Error(`Tùy chọn ${key} không hợp lệ.`);
    return match;
  };
  const ratio = (key: 'height' | 'build'): number => {
    if (a[key] === undefined) return DEFAULT_APPEARANCE[key];
    if (typeof a[key] !== 'number' || !Number.isFinite(a[key]) || (a[key] as number) < 0 || (a[key] as number) > 1)
      throw new Error(`Thông số ${key} phải nằm trong khoảng 0–1.`);
    return a[key] as number;
  };
  return {
    hair: option(HAIR_STYLES, 'hair', DEFAULT_APPEARANCE.hair),
    hairColor: option(HAIR_COLORS, 'hairColor', DEFAULT_APPEARANCE.hairColor),
    robeColor: option(ROBE_COLORS, 'robeColor', DEFAULT_APPEARANCE.robeColor),
    face: option(FACE_SHAPES, 'face', DEFAULT_APPEARANCE.face),
    skinTone: option(SKIN_TONES, 'skinTone', DEFAULT_APPEARANCE.skinTone),
    height: ratio('height'), build: ratio('build'),
  };
}

export function parseCreation(input: unknown, isAdmin: boolean, demo = false): { name: string; gender: Gender; appearance: Appearance } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('Thông tin nhân vật không hợp lệ.');
  const data = input as Record<string, unknown>;
  const requestedName = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : '';
  if (!/^[\p{L}\p{N} _-]{2,20}$/u.test(requestedName)) throw new Error('Tên nhân vật cần 2–20 ký tự chữ hoặc số.');
  // The demo has no admin at all. Let players use this display name there; NEVER grant its privileges.
  if (!isAdmin && !demo && requestedName.toLowerCase() === 'daniel965')
    throw new Error('Tên này dành riêng cho tài khoản quản trị. Hãy chọn tên khác.');
  if (data.gender !== 'nam' && data.gender !== 'nu') throw new Error('Giới tính không hợp lệ.');
  return { name: isAdmin ? 'daniel965' : requestedName, gender: data.gender, appearance: parseAppearance(data.appearance) };
}

export function newCharacter(ownerUid: string, data: ReturnType<typeof parseCreation>, now = Date.now()): CharacterState {
  const weapon = randomUUID();
  const robe = randomUUID();
  return {
    id: randomUUID(), ownerUid, name: data.name, gender: data.gender, appearance: data.appearance,
    root: rollSpiritRoot(), path: null, realm: 0, minorStage: 0,
    cultivation: 12, totalCultivation: 12, lastCultivatedAt: now, cultivationBank: 0,
    highestRealm: 0, rebirths: 0, stash: [],
    hp: 120, mp: 100, maxHp: 120, maxMp: 100,
    position: { x: 0, y: 0, z: 10 }, rotation: 0, scene: 'overworld', worldVersion: 2,
    equipment: { weapon, robe },
    inventory: [
      { instanceId: weapon, itemId: 'wooden_sword', acquiredAt: now },
      { instanceId: robe, itemId: 'novice_robe', acquiredAt: now },
    ],
    resources: { stones: 24, herbs: 6, ore: 4, ink: 3 },
    contribution: 0, sectRank: 'outer', storyStep: 0, storyKills: 0, bossKills: 0,
    dailyDay: '', dailyQuests: [], learnedSkills: ['spirit_cut'],
    hotbar: ['spirit_cut', null, null, null], devMode: false, createdAt: now,
  };
}

/** Bonus percentages add before the spirit-root multiplier; zone and coordinates are authoritative. */
export const isAtSpiritLake = inSpiritLake;
export function cultivationRate(c: CharacterState, at: Pick<CharacterState, 'scene' | 'position'> = c): number {
  return 2 * c.root.multiplier * absorptionMultiplier({ ...c, scene: at.scene, position: at.position });
}

/** Freeze earned EXP before a portal, lake crossing or realm change, without claiming it early. */
export function bankCultivation(c: CharacterState, now = Date.now(), at: Pick<CharacterState, 'scene' | 'position'> = c): number {
  const elapsed = Math.max(0, Math.min(now - c.lastCultivatedAt, OFFLINE_CAP_MS));
  const rate = cultivationRate(c, at);
  const gain = Math.floor(elapsed / 1000 * rate);
  if (gain <= 0) return 0;
  c.cultivationBank += gain;
  // Preserve fractional progress, discard time beyond the offline cap.
  c.lastCultivatedAt = now - (elapsed >= OFFLINE_CAP_MS ? 0 : elapsed - gain / rate * 1000);
  return gain;
}

export function gainCultivation(character: CharacterState, now = Date.now()): number {
  bankCultivation(character, now);
  const gain = character.cultivationBank;
  if (gain <= 0) return 0;
  character.cultivationBank = 0;
  character.cultivation += gain;
  character.totalCultivation += gain;
  character.hp = Math.min(character.maxHp, character.hp + Math.floor(gain / 3));
  character.mp = Math.min(character.maxMp, character.mp + Math.floor(gain / 2));
  return gain;
}

export function canEnterSanctum(c: CharacterState): boolean {
  return c.rebirths > 0 || c.realm === MAX_REALM && c.minorStage === LEVEL_CONFIG.minorStages;
}

/** A single prestige cycle: house, possessions and lifetime score persist; realm/stats restart. */
export function reincarnate(c: CharacterState, now = Date.now()): void {
  if (c.scene !== 'sanctum' || c.hp <= 0 || distanceXZ(c.position, REBIRTH_ALTAR.position) > REBIRTH_ALTAR.radius)
    throw new Error('Hãy đến trước Tái Sinh Đài trong mật thất.');
  if (c.rebirths > 0) throw new Error('Bạn đã tái sinh một lần, không thể nhận lại phần thưởng.');
  if (c.realm !== MAX_REALM || c.minorStage !== LEVEL_CONFIG.minorStages)
    throw new Error('Chỉ Tiên Đế tầng 9 mới có thể tái sinh.');
  c.highestRealm = MAX_REALM;
  c.rebirths = 1;
  c.realm = 0; c.minorStage = 0; c.cultivation = 12;
  c.cultivationBank = 0; c.lastCultivatedAt = now;
  c.maxHp = 120; c.maxMp = 100; c.hp = 120; c.mp = 100;
  // The spirit root, learned skills, equipment, stash and lifetime cultivation do not reroll.
}

/** Unique item instances move between two arrays; their IDs and ownership never come from the client. */
export function moveStoredItem(c: CharacterState, direction: unknown, instanceId: unknown): void {
  if (c.scene !== 'residence' || c.hp <= 0 || distanceXZ(c.position, HOME_CHEST.position) > HOME_CHEST.radius)
    throw new Error('Hãy đến gần rương trong nhà riêng để cất hoặc lấy đồ.');
  if (typeof instanceId !== 'string' || !instanceId || instanceId.length > 100 ||
      (direction !== 'deposit' && direction !== 'withdraw')) throw new Error('Vật phẩm hoặc thao tác không hợp lệ.');
  const from = direction === 'deposit' ? c.inventory : c.stash;
  const to = direction === 'deposit' ? c.stash : c.inventory;
  const index = from.findIndex((item) => item.instanceId === instanceId);
  if (index < 0 || to.some((item) => item.instanceId === instanceId)) throw new Error('Vật phẩm không thuộc kho/túi đồ của bạn.');
  if (direction === 'deposit' && Object.values(c.equipment).includes(instanceId))
    throw new Error('Tháo trang bị trước khi cất vào rương.');
  if (to.length >= (direction === 'deposit' ? storageCapacity(Math.max(c.highestRealm, c.devMode ? MAX_REALM : c.realm)) : 80))
    throw new Error(direction === 'deposit' ? 'Rương đã đầy. Hãy thăng cảnh giới để mở rộng nhà.' : 'Túi đồ đã đầy (80/80).');
  to.push(from.splice(index, 1)[0]);
}

/** Base wilderness drops 5%, reborn players 20%; Ascendant world 55% with immortal gear. */
export function artifactDropChance(scene: WorldZone, reborn: boolean): number {
  return scene === 'ascendant' && reborn ? 55 : scene === 'wilderness' ? reborn ? 20 : 5 : 0;
}

export function breakthroughCost(realm: number, minorStage = LEVEL_CONFIG.minorStages): number | null {
  return majorBreakthroughCost(realm, minorStage);
}

/** A minor advancement consumes the listed EXP exactly once and grants permanent base stats. */
export function advanceMinorStage(c: CharacterState): number {
  if (c.realm < 1 || c.realm > MAX_REALM || c.minorStage >= LEVEL_CONFIG.minorStages)
    throw new Error('Cần ở Luyện Khí trở lên và chưa đạt tầng 9.');
  const cost = expForStage(c.minorStage);
  if (c.cultivation < cost) throw new Error(`Cần ${cost.toLocaleString('vi-VN')} tu vi để lên tầng ${c.minorStage + 1}.`);
  c.cultivation -= cost;
  c.minorStage++;
  c.maxHp += LEVEL_CONFIG.minorReward.maxHp;
  c.maxMp += LEVEL_CONFIG.minorReward.maxMp;
  c.hp = Math.min(c.maxHp, c.hp + LEVEL_CONFIG.minorReward.maxHp);
  c.mp = Math.min(c.maxMp, c.mp + LEVEL_CONFIG.minorReward.maxMp);
  return cost;
}

/** Called only after the server resolves all nine tribulation waves and the success roll. */
export function completeMajorBreakthrough(c: CharacterState): number {
  const cost = majorBreakthroughCost(c.realm, c.minorStage);
  if (cost === null || c.cultivation < cost) throw new Error('Chưa đủ điều kiện đột phá Đại cảnh giới.');
  c.cultivation -= cost;
  c.realm++;
  c.highestRealm = Math.max(c.highestRealm, c.realm);
  c.minorStage = 1;
  c.maxHp += LEVEL_CONFIG.majorReward.maxHp;
  c.maxMp += LEVEL_CONFIG.majorReward.maxMp;
  c.hp = c.maxHp;
  c.mp = c.maxMp;
  return cost;
}

export function equippedStats(character: CharacterState): { attack: number; defense: number } {
  let attack = 0;
  let defense = 0;
  for (const slot of EQUIPMENT_SLOTS) {
    const instance = character.inventory.find((item) => item.instanceId === character.equipment[slot]);
    const item = instance && Object.hasOwn(ITEMS, instance.itemId) ? ITEMS[instance.itemId] : undefined;
    if (item) { attack += item.attack; defense += item.defense; }
  }
  return { attack, defense };
}

export function equipItem(character: CharacterState, instanceId: string): EquipmentSlot {
  const owned = character.inventory.find((item) => item.instanceId === instanceId);
  if (!owned) throw new Error('Vật phẩm không thuộc về nhân vật này.');
  const item = Object.hasOwn(ITEMS, owned.itemId) ? ITEMS[owned.itemId] : undefined;
  if (!item) throw new Error('Vật phẩm này không thể trang bị.');
  character.equipment[item.slot] = instanceId;
  return item.slot;
}

export function addItem(character: CharacterState, itemId: string): string {
  if (!Object.hasOwn(ITEMS, itemId) && !Object.hasOwn(CONSUMABLES, itemId)) throw new Error('ID vật phẩm không nằm trong danh mục.');
  if (character.inventory.length >= 80) throw new Error('Túi đồ đã đầy (80/80).');
  const instanceId = randomUUID();
  character.inventory.push({ instanceId, itemId, acquiredAt: Date.now() });
  return instanceId;
}

export function distanceXZ(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Server-side 3D horizontal hitboxes; the server supplies the origin and rotation. */
export function hitsTarget(
  shape: 'line' | 'sphere' | 'cone', origin: Vector3, rotation: number,
  target: Vector3, range: number, radius: number, targetRadius: number,
  sphereCenter: Vector3 = origin,
): boolean {
  if (shape === 'sphere') return distanceXZ(sphereCenter, target) <= radius + targetRadius;
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const forward = dx * Math.sin(rotation) + dz * Math.cos(rotation);
  if (forward < -targetRadius || forward > range + targetRadius) return false;
  const sideways = Math.abs(dx * Math.cos(rotation) - dz * Math.sin(rotation));
  if (shape === 'line') return sideways <= radius + targetRadius;
  return sideways <= (Math.max(0, forward) * Math.tan(Math.PI / 4)) + targetRadius;
}

export function clampToWorld(position: Vector3, radius: number): Vector3 {
  const length = Math.hypot(position.x, position.z);
  if (length > radius) {
    position.x = (position.x / length) * radius;
    position.z = (position.z / length) * radius;
  }
  position.y = 0;
  return position;
}
