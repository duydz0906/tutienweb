import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAILY_QUESTS, DEFAULT_APPEARANCE, expForStage, MAX_REALM, NPCS } from '@van-thuong/shared';
import { newCharacter } from './rules.js';
import { activateDevMode, revokeDevMode } from './devMode.js';
import { advanceDaily, claimDaily, ensureDaily, requireNpc, vietnamDay } from './sect.js';

const character = () => newCharacter('daily-test', { name: 'Thanh Vân', gender: 'nu', appearance: DEFAULT_APPEARANCE });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T17:01:00Z')); });
afterEach(() => vi.useRealTimers());

describe('five daily quests, UTC+7 boundary, and server-validated rewards', () => {
  it('rolls exactly five unique quests once per Vietnam calendar day and resets progress at 00:00', () => {
    const c = character();
    const firstDay = vietnamDay();
    expect(firstDay).toBe('2026-10-21');
    expect(vietnamDay(Date.parse('2026-10-20T16:59:59Z'))).toBe('2026-10-20');
    expect(ensureDaily(c, Date.now(), () => 0)).toBe(true);
    expect(c.dailyDay).toBe(firstDay);
    expect(new Set(c.dailyQuests.map((q) => q.id)).size).toBe(5);
    expect(c.dailyQuests.map((q) => q.id)).toEqual(Object.keys(DAILY_QUESTS).slice(0, 5));
    expect(ensureDaily(c, Date.now() + 1000, () => { throw new Error('Daily must not reroll.'); })).toBe(false);
    expect(advanceDaily(c, 'wolf', 3)).toBe(true);
    expect(c.dailyQuests.find((q) => q.id === 'kill_wolves')?.progress).toBe(3);
    expect(c.dailyQuests.find((q) => q.id === 'kill_monsters')?.progress).toBe(3);
    const previous = c.dailyQuests;
    expect(ensureDaily(c, Date.now() + 24 * 60 * 60 * 1000, () => 0)).toBe(true);
    expect(c.dailyDay).toBe('2026-10-22');
    expect(c.dailyQuests).not.toBe(previous);
    expect(c.dailyQuests.every((q) => !q.claimed && q.progress === 0)).toBe(true);
  });

  it('caps progress, rejects fake rewards and duplicate claims, and never trusts client amounts', () => {
    const c = character();
    ensureDaily(c, Date.now(), () => 0);
    expect(advanceDaily(c, 'gather', 999)).toBe(true);
    expect(c.dailyQuests.find((q) => q.id === 'gather_herbs')?.progress).toBe(10);
    expect(c.dailyQuests.find((q) => q.id === 'gather_more')?.progress).toBe(6);
    expect(advanceDaily(c, 'gather', 2)).toBe(false);
    expect(advanceDaily(c, 'gather', -1)).toBe(false);
    expect(() => claimDaily(c, '__proto__')).toThrow('không hợp lệ');
    expect(() => claimDaily(c, 'kill_wolves')).toThrow('chưa hoàn thành');
    const before = { ...c.resources }, exp = c.cultivation;
    expect(claimDaily(c, 'gather_herbs')).toContain('25 điểm cống hiến');
    expect([c.contribution, c.resources.stones - before.stones, c.cultivation - exp]).toEqual([25, 12, 100]);
    expect(() => claimDaily(c, 'gather_herbs')).toThrow('đã được nhận');
    expect(advanceDaily(c, 'wolf', Number.POSITIVE_INFINITY)).toBe(false);
    vi.setSystemTime(new Date('2026-10-21T17:01:00Z'));
    expect(() => claimDaily(c, 'gather_more')).toThrow('đã hết hạn');
    expect(advanceDaily(c, 'gather')).toBe(false);
  });

  it('checks server-owned NPC proximity and rejects remote interactions or dead players', () => {
    const c = character();
    expect(() => requireNpc(c, 'quest')).toThrow('đến gần');
    c.position = { ...NPCS.quest.position };
    expect(() => requireNpc(c, 'quest')).not.toThrow();
    expect(() => requireNpc(c, 'shop')).toThrow();
    c.hp = 0;
    expect(() => requireNpc(c, 'quest')).toThrow();
    c.hp = 100;
    c.scene = 'tribulation';
    expect(() => requireNpc(c, 'quest')).toThrow();
  });
});

describe('dev mode server state, persistence and safe demotion', () => {
  it('sets Tiên Đế 9, Chaos root and immortal stats and can restore the saved player', () => {
    const c = character();
    c.realm = 3; c.minorStage = 5; c.cultivation = 12_345; c.hp = 77; c.mp = 58;
    const original = structuredClone(c);
    expect(activateDevMode(c)).toBe(true);
    expect(activateDevMode(c)).toBe(false);
    expect([c.realm, c.minorStage, c.root.tier, c.root.multiplier, c.maxHp, c.maxMp]).toEqual([MAX_REALM, 9, 'hon_don', 10, 999_999_999, 999_999_999]);
    expect(c.cultivation).toBe(expForStage(9));
    expect(c.devModeBackup?.hp).toBe(77);
    const persisted = structuredClone(c);
    revokeDevMode(persisted);
    expect(persisted).toEqual(original);
    expect(() => revokeDevMode({ ...c, devModeBackup: undefined })).toThrow('khôi phục');
  });
});
