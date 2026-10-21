import { randomInt } from 'node:crypto';
import { DAILY_QUESTS, MONSTER_KINDS, NPCS, npcScene, type CharacterState, type DailyQuestId, type NpcId, type Vector3 } from '@van-thuong/shared';
import { distanceXZ } from './rules.js';

/** Daily reset is midnight Vietnam time (UTC+7), independent of the server's timezone. */
export function vietnamDay(now = Date.now()): string {
  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Draw exactly five unique quests once per day, persisting both the draw and rewards claimed. */
export function ensureDaily(c: CharacterState, now = Date.now(), draw: (max: number) => number = randomInt): boolean {
  const day = vietnamDay(now);
  if (c.dailyDay === day && c.dailyQuests.length === 5) return false;
  const pool = Object.keys(DAILY_QUESTS) as DailyQuestId[];
  const selected: DailyQuestId[] = [];
  for (let i = 0; i < 5; i++) selected.push(pool.splice(draw(pool.length), 1)[0]);
  c.dailyDay = day;
  c.dailyQuests = selected.map((id) => ({ id, progress: 0, claimed: false }));
  return true;
}

export function advanceDaily(c: CharacterState, kind: string, amount = 1): boolean {
  if (!Number.isSafeInteger(amount) || amount <= 0 || c.dailyDay !== vietnamDay()) return false;
  let changed = false;
  for (const entry of c.dailyQuests) {
    const quest = DAILY_QUESTS[entry.id];
    if (!quest || entry.claimed || (quest.kind !== kind && !(quest.kind === 'kill' && MONSTER_KINDS.some((monster) => monster === kind)))) continue;
    const next = Math.min(quest.target, entry.progress + amount);
    if (next > entry.progress) { entry.progress = next; changed = true; }
  }
  return changed;
}

export function requireNpc(c: CharacterState, npcId: NpcId, radius = 4.2): void {
  const npc = NPCS[npcId];
  const scene = npcScene(npcId);
  if (c.scene !== scene || c.hp <= 0 || distanceXZ(c.position, npc.position) > radius)
    throw new Error(`Hãy đến gần ${npc.name} tại ${scene === 'village' ? 'Vân Cốc' : 'Tông Môn'}.`);
}

export function nearNpc(position: Vector3, npcId: NpcId, radius = 4.2): boolean {
  return distanceXZ(position, NPCS[npcId].position) <= radius;
}

export function claimDaily(c: CharacterState, questId: unknown): string {
  if (typeof questId !== 'string' || !Object.hasOwn(DAILY_QUESTS, questId)) throw new Error('Nhiệm vụ không hợp lệ.');
  const entry = c.dailyQuests.find((q) => q.id === questId);
  const quest = DAILY_QUESTS[questId as DailyQuestId];
  if (!entry || c.dailyDay !== vietnamDay()) throw new Error('Nhiệm vụ đã hết hạn.');
  if (entry.claimed) throw new Error('Phần thưởng đã được nhận.');
  if (entry.progress < quest.target) throw new Error('Nhiệm vụ chưa hoàn thành.');
  entry.claimed = true;
  c.contribution += quest.reward.contribution;
  c.resources.stones += quest.reward.stones;
  c.cultivation += quest.reward.exp;
  c.totalCultivation += quest.reward.exp;
  return `Nhận ${quest.reward.contribution} điểm cống hiến, ${quest.reward.exp} EXP và ${quest.reward.stones} linh thạch.`;
}
