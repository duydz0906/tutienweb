import { randomInt, randomUUID } from 'node:crypto';
import {
  BREAKTHROUGH_COSTS, EQUIPMENT_SLOTS, ITEMS, ROOT_MULTIPLIER,
  type Appearance, type CharacterState, type Element, type EquipmentSlot,
  type Gender, type SpiritRoot, type Vector3,
} from '@van-thuong/shared';

const COMMON_ELEMENTS: Element[] = ['kim', 'moc', 'thuy', 'hoa', 'tho'];
const MUTATED_ELEMENTS: Element[] = ['bang', 'phong', 'loi', 'am', 'quang'];
export const GOD_STAT = 999_999_999;
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
export const WORLD_RADIUS = 45;
export const TRIAL_RADIUS = 17;

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

export function parseCreation(input: unknown, isAdmin: boolean): { name: string; gender: Gender; appearance: Appearance } {
  if (typeof input !== 'object' || input === null) throw new Error('Thông tin nhân vật không hợp lệ.');
  const data = input as Record<string, unknown>;
  const requestedName = typeof data.name === 'string' ? data.name.trim().replace(/\s+/g, ' ') : '';
  if (!/^[\p{L}\p{N} _-]{2,20}$/u.test(requestedName)) throw new Error('Tên nhân vật cần 2–20 ký tự chữ hoặc số.');
  if (!isAdmin && requestedName.toLowerCase() === 'daniel965') throw new Error('Tên này đã được bảo lưu.');
  if (data.gender !== 'nam' && data.gender !== 'nu') throw new Error('Giới tính không hợp lệ.');
  const raw = data.appearance;
  if (typeof raw !== 'object' || raw === null) throw new Error('Ngoại hình không hợp lệ.');
  const a = raw as Record<string, unknown>;
  if (a.hair !== 'long' && a.hair !== 'tied') throw new Error('Kiểu tóc không hợp lệ.');
  if (a.hairColor !== 'ink' && a.hairColor !== 'silver') throw new Error('Màu tóc không hợp lệ.');
  if (a.robeColor !== 'ivory' && a.robeColor !== 'jade' && a.robeColor !== 'ember') throw new Error('Màu y phục không hợp lệ.');
  return { name: isAdmin ? 'daniel965' : requestedName, gender: data.gender, appearance: a as Appearance };
}

export function newCharacter(ownerUid: string, data: ReturnType<typeof parseCreation>, now = Date.now()): CharacterState {
  const weapon = randomUUID();
  const robe = randomUUID();
  return {
    id: randomUUID(), ownerUid, name: data.name, gender: data.gender, appearance: data.appearance,
    root: rollSpiritRoot(), path: null, realm: 0, cultivation: 12, totalCultivation: 12,
    lastCultivatedAt: now, hp: 120, mp: 100, maxHp: 120, maxMp: 100,
    position: { x: 0, y: 0, z: 10 }, rotation: Math.PI, scene: 'overworld',
    equipment: { weapon, robe },
    inventory: [
      { instanceId: weapon, itemId: 'wooden_sword', acquiredAt: now },
      { instanceId: robe, itemId: 'novice_robe', acquiredAt: now },
    ],
    resources: { stones: 24, herbs: 6, ore: 4, ink: 3 }, createdAt: now,
  };
}

export function gainCultivation(character: CharacterState, now = Date.now()): number {
  const elapsed = Math.max(0, Math.min(now - character.lastCultivatedAt, OFFLINE_CAP_MS));
  const rate = 2 * character.root.multiplier;
  const gain = Math.floor((elapsed / 1000) * rate);
  if (gain <= 0) return 0;
  character.cultivation += gain;
  character.totalCultivation += gain;
  // Preserve sub-second progress; if offline beyond cap, discard the excess.
  character.lastCultivatedAt = now - (elapsed >= OFFLINE_CAP_MS ? 0 : (elapsed - (gain / rate) * 1000));
  character.hp = Math.min(character.maxHp, character.hp + Math.floor(gain / 3));
  character.mp = Math.min(character.maxMp, character.mp + Math.floor(gain / 2));
  return gain;
}

export function breakthroughCost(realm: number): number | null {
  return BREAKTHROUGH_COSTS[realm] ?? null;
}

export function equippedStats(character: CharacterState): { attack: number; defense: number } {
  let attack = 0;
  let defense = 0;
  for (const slot of EQUIPMENT_SLOTS) {
    const instance = character.inventory.find((item) => item.instanceId === character.equipment[slot]);
    const item = instance && ITEMS[instance.itemId];
    if (item) { attack += item.attack; defense += item.defense; }
  }
  return { attack, defense };
}

export function equipItem(character: CharacterState, instanceId: string): EquipmentSlot {
  const owned = character.inventory.find((item) => item.instanceId === instanceId);
  if (!owned) throw new Error('Vật phẩm không thuộc về nhân vật này.');
  const item = ITEMS[owned.itemId];
  if (!item) throw new Error('Vật phẩm không tồn tại.');
  character.equipment[item.slot] = instanceId;
  return item.slot;
}

export function addItem(character: CharacterState, itemId: string): string {
  if (!ITEMS[itemId]) throw new Error('ID vật phẩm không nằm trong danh mục.');
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
