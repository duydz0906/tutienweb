import Redis from 'ioredis';
import { SKILLS, type CharacterState, type LeaderboardEntry } from '@van-thuong/shared';

export interface GameCache {
  update(character: CharacterState, isAdmin: boolean): Promise<void>;
  removePosition(characterId: string): Promise<void>;
  leaderboard(): Promise<LeaderboardEntry[]>;
  cooldowns(characterId: string): Promise<Record<string, number>>;
  reserveCooldown(characterId: string, skillId: string, durationMs: number): Promise<{ allowed: boolean; readyAt: number }>;
  close(): Promise<void>;
}

export class MemoryCache implements GameCache {
  private readonly entries = new Map<string, LeaderboardEntry>();
  private readonly positions = new Map<string, string>();
  private readonly skillCooldowns = new Map<string, number>();
  async update(c: CharacterState, admin: boolean): Promise<void> {
    this.positions.set(c.id, JSON.stringify({ scene: c.scene, position: c.position, at: Date.now() }));
    if (!admin) this.entries.set(c.id, { id: c.id, name: c.name, realm: c.realm, score: c.totalCultivation + c.realm * 500 });
  }
  async removePosition(id: string): Promise<void> { this.positions.delete(id); }
  async leaderboard(): Promise<LeaderboardEntry[]> {
    return [...this.entries.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  }
  async cooldowns(characterId: string): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const [key, until] of this.skillCooldowns) {
      if (until <= Date.now()) { this.skillCooldowns.delete(key); continue; }
      if (key.startsWith(`${characterId}:`)) result[key.slice(characterId.length + 1)] = until;
    }
    return result;
  }
  async reserveCooldown(characterId: string, skillId: string, durationMs: number): Promise<{ allowed: boolean; readyAt: number }> {
    const key = `${characterId}:${skillId}`;
    const existing = this.skillCooldowns.get(key) ?? 0;
    if (existing > Date.now()) return { allowed: false, readyAt: existing };
    const readyAt = Date.now() + durationMs;
    this.skillCooldowns.set(key, readyAt);
    return { allowed: true, readyAt };
  }
  async close(): Promise<void> { this.entries.clear(); this.positions.clear(); this.skillCooldowns.clear(); }
}

export class RedisCache implements GameCache {
  private readonly redis: Redis;
  constructor(uri: string) {
    this.redis = new Redis(uri, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }
  async connect(): Promise<void> { await this.redis.connect(); await this.redis.ping(); console.info('[cache] Redis ready.'); }
  async update(c: CharacterState, admin: boolean): Promise<void> {
    const tx = this.redis.multi().set(`scene:${c.id}`, JSON.stringify({ scene: c.scene, position: c.position, rotation: c.rotation, at: Date.now() }), 'EX', 30);
    if (!admin) {
      tx.zadd('rank:cultivation', c.totalCultivation + c.realm * 500, c.id);
      tx.hset('rank:names', c.id, JSON.stringify({ name: c.name, realm: c.realm }));
    }
    await tx.exec();
  }
  async removePosition(id: string): Promise<void> { await this.redis.del(`scene:${id}`); }
  async leaderboard(): Promise<LeaderboardEntry[]> {
    const results = await this.redis.zrevrange('rank:cultivation', 0, 9, 'WITHSCORES');
    const ids = results.filter((_, i) => i % 2 === 0);
    if (!ids.length) return [];
    const names = await this.redis.hmget('rank:names', ...ids);
    return ids.map((id, i) => {
      const info = names[i] ? JSON.parse(names[i]) as { name: string; realm: number } : { name: 'Ẩn danh', realm: 0 };
      return { id, name: info.name, realm: info.realm, score: Number(results[i * 2 + 1]) };
    });
  }
  async cooldowns(characterId: string): Promise<Record<string, number>> {
    // Fixed, bounded MGET rather than a blocking Redis KEYS scan.
    const skillIds = [...Object.keys(SKILLS), 'formation_pillar', 'trial_guard'];
    const values = await this.redis.mget(...skillIds.map((id) => `cooldown:${characterId}:${id}`));
    return Object.fromEntries(skillIds.flatMap((id, i) => values[i] ? [[id, Number(values[i])]] : []));
  }
  async reserveCooldown(characterId: string, skillId: string, durationMs: number): Promise<{ allowed: boolean; readyAt: number }> {
    const key = `cooldown:${characterId}:${skillId}`;
    const readyAt = Date.now() + durationMs;
    // SET NX PX is atomic even if two packets arrive at the same time or on different workers.
    const granted = await this.redis.set(key, String(readyAt), 'PX', durationMs, 'NX');
    if (granted === 'OK') return { allowed: true, readyAt };
    const stored = await this.redis.get(key);
    return { allowed: false, readyAt: stored ? Number(stored) : Date.now() + 100 };
  }
  async close(): Promise<void> { this.redis.disconnect(); }
}
