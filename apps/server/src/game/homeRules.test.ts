import { describe, expect, it } from 'vitest';
import { ASCENDANT_BONUS, HOME_CHEST, LINH_GIOI_BONUS, LINH_GIOI_SECTS, MAX_REALM, REBIRTH_ALTAR, REBIRTH_BONUS,
  SPIRIT_LAKE, absorptionMultiplier, houseAbsorptionBonus, houseLevel, linhGioiSectAt, storageCapacity } from '@van-thuong/shared';
import { addItem, artifactDropChance, bankCultivation, canEnterSanctum, canRebirth, cultivationRate,
  gainCultivation, moveStoredItem, newCharacter, reincarnate } from './rules.js';

const make = (uid: string) => newCharacter(uid, { name: 'Đệ Tử Thử', gender: 'nu', appearance: {
  hair: 'long', hairColor: 'ink', robeColor: 'ivory', face: 'oval', skinTone: 'warm', height: 0.5, build: 0.5,
} }, 100_000);

describe('private housing, context-based spirit absorption and repeatable rebirth', () => {
  it('raises house capacity and EXP bonus at every major realm and never above +20%', () => {
    const bonuses = Array.from({ length: MAX_REALM + 1 }, (_, realm) => houseAbsorptionBonus(realm));
    expect(bonuses[0]).toBe(0.05);
    expect(bonuses[MAX_REALM]).toBe(0.2);
    expect(bonuses.every((value, i) => i === 0 || value > bonuses[i - 1])).toBe(true);
    expect(houseLevel(0)).toBe(1);
    expect(houseLevel(MAX_REALM)).toBe(MAX_REALM + 1);
    expect(storageCapacity(0)).toBe(12);
    expect(storageCapacity(MAX_REALM)).toBe(12 + MAX_REALM * 6);
  });

  it('banks lake time at its own rate before travel; stacks +15%, +50%, and +35% only in the proper scene', () => {
    const c = make('lake-account');
    c.root.multiplier = 1;
    c.scene = 'overworld';
    c.position = { ...SPIRIT_LAKE.position };
    const lakeRate = 2 * (1 + houseAbsorptionBonus(0) + SPIRIT_LAKE.bonus);
    expect(cultivationRate(c)).toBeCloseTo(lakeRate);
    expect(bankCultivation(c, 110_000)).toBe(Math.floor(10 * lakeRate));
    c.scene = 'ascendant'; c.position = { x: 0, y: 0, z: 0 };
    // A forged scene by the client cannot affect this calculation: only the stored character does.
    expect(cultivationRate(c)).toBeCloseTo(2 * (1 + 0.05));
    c.rebirths = 1; c.highestRealm = MAX_REALM;
    expect(cultivationRate(c)).toBeCloseTo(2 * (1 + 0.2 + REBIRTH_BONUS + ASCENDANT_BONUS));
    expect(gainCultivation(c, 120_000)).toBe(Math.floor(10 * lakeRate) + 41);
    c.scene = 'overworld'; c.position = { ...SPIRIT_LAKE.position };
    expect(cultivationRate(c)).toBeCloseTo(2 * (1 + 0.2 + REBIRTH_BONUS + SPIRIT_LAKE.bonus));
    c.scene = 'residence';
    expect(cultivationRate(c)).toBeCloseTo(2 * (1 + 0.2 + REBIRTH_BONUS));
  });

  it('grants the +40% Linh Giới AFK bonus only on a sect terrace of the ascendant map', () => {
    const c = make('linh-gioi-account');
    c.root.multiplier = 1;
    const [thienKiem] = LINH_GIOI_SECTS;
    const off = absorptionMultiplier(c);
    expect(LINH_GIOI_BONUS).toBe(0.4);
    expect(linhGioiSectAt('ascendant', { x: 0, y: 0, z: 0 })).toBeNull();
    c.scene = 'ascendant';
    c.position = { ...thienKiem.afk.position };
    expect(linhGioiSectAt(c.scene, c.position)?.id).toBe(thienKiem.id);
    expect(absorptionMultiplier(c)).toBeCloseTo(off + 0.4);
    expect(cultivationRate(c)).toBeCloseTo(2 * (1 + houseAbsorptionBonus(0) + LINH_GIOI_BONUS));
    // Just outside the terrace radius gives nothing back.
    c.position = { x: thienKiem.afk.position.x + thienKiem.afk.radius + 1, y: 0, z: thienKiem.afk.position.z };
    expect(linhGioiSectAt(c.scene, c.position)).toBeNull();
    expect(absorptionMultiplier(c)).toBeCloseTo(off);
    // The same coordinates on the overworld are not a Linh Giới terrace.
    c.scene = 'overworld'; c.position = { ...thienKiem.afk.position };
    expect(linhGioiSectAt(c.scene, c.position)).toBeNull();
    for (const sect of LINH_GIOI_SECTS) {
      expect(sect.afk.position.x).toBe(sect.center.x);
      expect(sect.afk.position.z).toBe(sect.center.z);
    }
  });

  it('moves each unique instance once, requires its owner in the room, rejects equipped/full storage and full bag', () => {
    const owner = make('owner-account');
    const stranger = make('stranger-account');
    const gem = addItem(owner, 'fate_orb');
    const sword = owner.equipment.weapon!;
    expect(() => moveStoredItem(owner, 'deposit', gem)).toThrow('rương');
    owner.scene = 'residence'; owner.position = { ...HOME_CHEST.position };
    stranger.scene = 'residence'; stranger.position = { ...HOME_CHEST.position };
    expect(() => moveStoredItem(stranger, 'deposit', gem)).toThrow('không thuộc');
    expect(() => moveStoredItem(owner, 'deposit', sword)).toThrow('Tháo trang bị');
    moveStoredItem(owner, 'deposit', gem);
    expect(owner.inventory.some((item) => item.instanceId === gem)).toBe(false);
    expect(owner.stash.map((item) => item.instanceId)).toEqual([gem]);
    expect(() => moveStoredItem(owner, 'deposit', gem)).toThrow('không thuộc');
    expect(() => moveStoredItem(stranger, 'withdraw', gem)).toThrow('không thuộc');
    expect(() => moveStoredItem(owner, '__proto__', gem)).toThrow('không hợp lệ');
    moveStoredItem(owner, 'withdraw', gem);
    expect(owner.stash).toHaveLength(0);
    expect(owner.inventory.filter((item) => item.instanceId === gem)).toHaveLength(1);
    owner.stash = Array.from({ length: storageCapacity(0) }, (_, i) => ({ instanceId: `old-${i}`, itemId: 'fate_orb', acquiredAt: i }));
    expect(() => moveStoredItem(owner, 'deposit', gem)).toThrow('Rương đã đầy');
    owner.stash = [owner.stash[0]];
    owner.inventory = Array.from({ length: 80 }, (_, i) => ({ instanceId: `bag-${i}`, itemId: 'fate_orb', acquiredAt: i }));
    expect(() => moveStoredItem(owner, 'withdraw', 'old-0')).toThrow('Túi đồ đã đầy');
  });

  it('opens the hidden chamber at the true top, resets progress but keeps items and house, every cycle', () => {
    const c = make('rebirth-account');
    expect(canEnterSanctum(c)).toBe(false);
    c.realm = MAX_REALM; c.minorStage = 8;
    expect(canEnterSanctum(c)).toBe(false);
    c.minorStage = 9; c.highestRealm = MAX_REALM; c.scene = 'sanctum';
    const item = addItem(c, 'fate_orb');
    c.stash.push({ instanceId: 'stored', itemId: 'spirit_fox', acquiredAt: 100_000 });
    c.cultivation = 500; c.cultivationBank = 200; c.totalCultivation = 100_000;
    const root = structuredClone(c.root);
    const equipment = structuredClone(c.equipment);
    c.position = { x: 0, y: 0, z: 5 };
    expect(() => reincarnate(c)).toThrow('Tái Sinh Đài');
    c.position = { ...REBIRTH_ALTAR.position };
    reincarnate(c, 120_000);
    expect([c.realm, c.minorStage, c.rebirths, c.highestRealm, c.maxHp, c.maxMp]).toEqual([0, 0, 1, MAX_REALM, 120, 100]);
    expect([c.cultivation, c.cultivationBank, c.lastCultivatedAt, c.totalCultivation]).toEqual([12, 0, 120_000, 100_000]);
    expect(c.stash.map((entry) => entry.instanceId)).toEqual(['stored']);
    expect(c.inventory.some((entry) => entry.instanceId === item)).toBe(true);
    expect(c.equipment).toEqual(equipment); expect(c.root).toEqual(root);
    expect(canEnterSanctum(c)).toBe(true);
    // The altar is sealed again immediately: rebirth needs Tiên Đế tầng 9 every single time.
    expect(canRebirth(c)).toBe(false);
    expect(() => reincarnate(c, 120_001)).toThrow('Tiên Đế tầng 9');
    // Climbing back up re-opens it, and the second rebirth works exactly like the first.
    c.realm = MAX_REALM; c.minorStage = 9; c.hp = c.maxHp;
    expect(canRebirth(c)).toBe(true);
    reincarnate(c, 130_000);
    expect([c.realm, c.minorStage, c.rebirths, c.maxHp]).toEqual([0, 0, 2, 120]);
    expect(canEnterSanctum(c)).toBe(true); // the Thượng Giới gate stays reachable
    expect(canRebirth(c)).toBe(false);
    expect(artifactDropChance('wilderness', false)).toBe(5);
    expect(artifactDropChance('wilderness', true)).toBe(20);
    expect(artifactDropChance('ascendant', true)).toBe(55);
    expect(artifactDropChance('ascendant', false)).toBe(0);
  });
});
