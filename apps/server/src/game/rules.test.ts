import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, expForStage, LEVEL_CONFIG, MAX_REALM, normalizeAppearance, REALMS } from '@van-thuong/shared';
import { MemoryStore } from '../db/store.js';
import { addItem, advanceMinorStage, breakthroughCost, clampToWorld, completeMajorBreakthrough, distanceXZ, equipItem,
  gainCultivation, hitsTarget, newCharacter, OFFLINE_CAP_MS, parseAppearance, parseCreation, rollSpiritRoot } from './rules.js';

const data = { name: 'Tiểu Vân', gender: 'nu' as const, appearance: { ...DEFAULT_APPEARANCE, robeColor: 'jade' as const } };
const drawAt = (result: number) => (max: number) => max === 10_000 ? result : 0;

describe('server-only Linh Căn RNG', () => {
  it('uses the exact 60 / 30 / 9 / 1 distribution, including boundaries', () => {
    const counts: Record<string, number> = {};
    for (let n = 0; n < 10_000; n++) {
      const root = rollSpiritRoot(drawAt(n));
      counts[root.tier] = (counts[root.tier] ?? 0) + 1;
      expect(root.elements.length).toBe(root.tier === 'tap' ? 4 : root.tier === 'chan' ? 2 : 1);
      expect(new Set(root.elements).size).toBe(root.elements.length);
    }
    expect(counts).toEqual({ tap: 6000, chan: 3000, thien: 900, bien_di: 100 });
    expect(rollSpiritRoot(drawAt(9900)).elements[0]).toBe('bang');
  });
  it('rejects an invalid generator rather than silently re-rolling', () => {
    expect(() => rollSpiritRoot(() => 10000)).toThrow('Invalid RNG');
  });
});

describe('characters, AFK and equipment', () => {
  it('keeps admin authorization server-side without blocking the demo nickname', () => {
    expect(() => parseCreation({ ...data, name: 'Daniel965', isAdmin: true }, false)).toThrow('dành riêng');
    expect(parseCreation({ ...data, name: 'Daniel965', isAdmin: true }, false, true).name).toBe('Daniel965');
    expect(parseCreation({ ...data, name: 'Anything', isAdmin: false }, true).name).toBe('daniel965');
    expect(() => parseCreation({ ...data, appearance: { ...data.appearance, hair: '<script>' } }, false)).toThrow();
  });
  it('validates appearance morphs and upgrades older saved characters without rerolling', () => {
    expect(parseAppearance(data.appearance).face).toBe('oval');
    expect(parseAppearance({ hair: 'long', hairColor: 'ink', robeColor: 'jade' })).toEqual({ ...DEFAULT_APPEARANCE, robeColor: 'jade' });
    expect(normalizeAppearance({ hair: 'tied', hairColor: 'silver', robeColor: 'ember' })).toEqual({ ...DEFAULT_APPEARANCE, hair: 'tied', hairColor: 'silver', robeColor: 'ember' });
    for (const field of ['height', 'build']) {
      expect(() => parseAppearance({ ...data.appearance, [field]: -0.1 })).toThrow();
      expect(() => parseAppearance({ ...data.appearance, [field]: 1.01 })).toThrow();
      expect(() => parseAppearance({ ...data.appearance, [field]: '0.5' })).toThrow();
    }
    expect(() => parseAppearance({ ...data.appearance, skinTone: 'invisible' })).toThrow();
    expect(() => parseAppearance({ ...data.appearance, face: '<script>' })).toThrow();
  });
  it('returns an existing character instead of granting a second root draw', async () => {
    const store = new MemoryStore();
    const first = newCharacter('demo-123', data);
    expect((await store.create(first)).id).toBe(first.id);
    const other = newCharacter('demo-123', data);
    expect((await store.create(other)).id).toBe(first.id);
    expect((await store.get('demo-123'))?.root).toEqual(first.root);
  });
  it('credits only full tu vi, preserves fractional time, and caps offline gain', () => {
    const c = newCharacter('demo-afk', data, 100_000);
    c.root.multiplier = 1;
    expect(gainCultivation(c, 101_250)).toBe(2);
    expect(gainCultivation(c, 101_700)).toBe(1);
    expect(gainCultivation(c, 101_750)).toBe(0);
    const longGone = newCharacter('demo-offline', data, 1000);
    longGone.root.multiplier = 1;
    expect(gainCultivation(longGone, 1000 + OFFLINE_CAP_MS * 3)).toBe(60_480);
    expect(gainCultivation(longGone, 1000 + OFFLINE_CAP_MS * 3)).toBe(0);
  });
  it('can only equip a genuinely owned inventory instance', () => {
    const c = newCharacter('demo-items', data);
    expect(() => equipItem(c, 'foreign-instance')).toThrow('không thuộc');
    const instance = addItem(c, 'fate_orb');
    expect(equipItem(c, instance)).toBe('artifact');
    expect(c.equipment.artifact).toBe(instance);
    expect(() => addItem(c, 'not-in-whitelist')).toThrow();
  });
  it('resets ×5 EXP at every great realm and grants exactly +100 HP / +200 MP per major crossing', () => {
    expect(REALMS).toHaveLength(12);
    expect(MAX_REALM).toBe(11);
    expect(breakthroughCost(0, 0)).toBe(LEVEL_CONFIG.exp.entryCost);
    expect(breakthroughCost(4, 8)).toBeNull();
    expect(breakthroughCost(4, 9)).toBe(39_062_500);
    expect(Array.from({ length: 9 }, (_, i) => expForStage(i + 1))).toEqual(
      [100, 500, 2500, 12500, 62500, 312500, 1562500, 7812500, 39062500]);
    expect(() => expForStage(10)).toThrow();
    const c = newCharacter('progression', data);
    c.cultivation = 35;
    completeMajorBreakthrough(c);
    expect([c.realm, c.minorStage, c.maxHp, c.maxMp, c.hp, c.mp]).toEqual([1, 1, 220, 300, 220, 300]);
    for (let realm = 1; realm < MAX_REALM; realm++) {
      for (let stage = 1; stage < 9; stage++) {
        const previousHp = c.maxHp, previousMp = c.maxMp;
        c.cultivation = expForStage(stage);
        expect(advanceMinorStage(c)).toBe(expForStage(stage));
        expect(c.minorStage).toBe(stage + 1);
        expect(c.cultivation).toBe(0);
        expect([c.maxHp - previousHp, c.maxMp - previousMp]).toEqual([10, 20]);
      }
      expect(() => advanceMinorStage(c)).toThrow('tầng 9');
      const hp = c.maxHp, mp = c.maxMp;
      c.cultivation = expForStage(9);
      expect(completeMajorBreakthrough(c)).toBe(39_062_500);
      expect([c.realm, c.minorStage, c.cultivation]).toEqual([realm + 1, 1, 0]);
      expect([c.maxHp - hp, c.maxMp - mp, c.hp, c.mp]).toEqual([100, 200, hp + 100, mp + 200]);
      expect(completeMajorBreakthrough.bind(null, c)).toThrow();
    }
    expect(c.realm).toBe(MAX_REALM);
    expect(breakthroughCost(MAX_REALM, 9)).toBeNull();
  });
});

describe('server hitboxes and world bounds', () => {
  const origin = { x: 0, y: 0, z: 0 };
  it('checks direction, ray width and range for sword skills', () => {
    expect(hitsTarget('line', origin, 0, { x: 0.4, y: 0, z: 8 }, 9, 0.6, 0.7)).toBe(true);
    expect(hitsTarget('line', origin, 0, { x: 4, y: 0, z: 8 }, 9, 0.6, 0.7)).toBe(false);
    expect(hitsTarget('line', origin, 0, { x: 0, y: 0, z: -4 }, 9, 0.6, 0.7)).toBe(false);
    expect(hitsTarget('line', origin, 0, { x: 0, y: 0, z: 15 }, 9, 0.6, 0.7)).toBe(false);
  });
  it('checks sphere AoE and cone rather than trusting a client-reported hit', () => {
    const center = { x: 6, y: 0, z: 0 };
    expect(hitsTarget('sphere', origin, 0, { x: 11, y: 0, z: 0 }, 12, 3.5, 0.7, center)).toBe(false);
    expect(hitsTarget('sphere', origin, 0, { x: 8, y: 0, z: 0 }, 12, 3.5, 0.7, center)).toBe(true);
    expect(hitsTarget('cone', origin, 0, { x: 2, y: 0, z: 4 }, 9, 0, 0.5)).toBe(true);
    expect(hitsTarget('cone', origin, 0, { x: 8, y: 0, z: 3 }, 9, 0, 0.5)).toBe(false);
  });
  it('clamps even forged locations to a playable ground-plane radius', () => {
    const p = clampToWorld({ x: 100, y: 999, z: 100 }, 45);
    expect(distanceXZ(p, origin)).toBeCloseTo(45);
    expect(p.y).toBe(0);
  });
});
