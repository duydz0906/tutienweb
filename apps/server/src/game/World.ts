import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  CONSUMABLES, DAILY_QUESTS, HERB_NODES, ITEMS, LEVEL_CONFIG, MAX_REALM, NPCS, PORTALS, REALMS, RECIPES, SHOP_STOCK, SKILLS, expForStage, skillsForPath,
  type ActionResult, type BossState, type CharacterState, type ChatMessage, type DailyQuestId,
  type CombatEvent, type FormationState, type MonsterState, type OwnCharacter, type Path, type PublicPlayer,
  type TribulationState, type Vector3, type WorldDrop, type WorldSnapshot, type WorldZone,
} from '@van-thuong/shared';
import type { Identity } from '../auth.js';
import { isLocalDevIdentity } from '../localDev.js';
import type { CharacterStore } from '../db/store.js';
import type { GameCache } from '../db/cache.js';
import {
  addItem, advanceMinorStage, breakthroughCost, clampToWorld, completeMajorBreakthrough, distanceXZ, equipItem,
  equippedStats, gainCultivation, GOD_STAT, hitsTarget, parseAppearance, TRIAL_RADIUS, WORLD_RADIUS,
} from './rules.js';
import { canWalkInSect } from './sectGeometry.js';
import { activateDevMode, hasDevPower, ownCharacter, revokeDevMode } from './devMode.js';
import { advanceDaily, claimDaily, ensureDaily, requireNpc } from './sect.js';

type Trial = { state: TribulationState; returnPosition: Vector3; returnScene: WorldZone };
type LivePlayer = {
  identity: Identity; character: CharacterState; socket: Socket;
  input: { x: number; z: number }; lastInputAt: number;
  cooldowns: Map<string, number>; lastChatAt: number; lastAdminAt: number; lastAppearanceAt: number;
  casting: boolean; shieldUntil: number;
  guardUntil: number; trial: Trial | null; respawnAt: number;
};
type Ack = (result: ActionResult) => void;

function message(error: unknown): string { return error instanceof Error ? error.message : 'Thao tác thất bại.'; }
function own(s: LivePlayer): OwnCharacter {
  return { ...ownCharacter(s.character, s.identity), shieldUntil: s.shieldUntil };
}
function publicPlayer(s: LivePlayer): PublicPlayer {
  const c = s.character;
  const god = hasDevPower(c, s.identity);
  return {
    id: c.id, name: c.name, position: c.position, rotation: c.rotation,
    hp: god ? GOD_STAT : c.hp, maxHp: god ? GOD_STAT : c.maxHp,
    realm: c.realm, minorStage: c.minorStage, path: c.path, root: c.root, gender: c.gender, appearance: c.appearance,
    equipment: Object.fromEntries(Object.entries(c.equipment).map(([slot, instanceId]) => {
      const item = c.inventory.find((ownedItem) => ownedItem.instanceId === instanceId);
      return [slot, item?.itemId];
    }).filter(([, id]) => id)) as PublicPlayer['equipment'],
    isAdmin: s.identity.isAdmin, devMode: god, shieldUntil: s.shieldUntil,
  };
}

const MONSTER_SPAWNS: MonsterState[] = [
  { id: 'wolf-1', kind: 'wolf', name: 'Linh Lang', level: 1, position: { x: -9, y: 0, z: -12 }, maxHp: 75, hp: 75, radius: 0.9, respawnAt: null },
  { id: 'wolf-2', kind: 'wolf', name: 'Linh Lang', level: 1, position: { x: 10, y: 0, z: -14 }, maxHp: 75, hp: 75, radius: 0.9, respawnAt: null },
  { id: 'wolf-3', kind: 'wolf', name: 'Linh Lang', level: 2, position: { x: -14, y: 0, z: -7 }, maxHp: 95, hp: 95, radius: 0.9, respawnAt: null },
  { id: 'wolf-4', kind: 'wolf', name: 'Linh Lang', level: 2, position: { x: 14, y: 0, z: -7 }, maxHp: 95, hp: 95, radius: 0.9, respawnAt: null },
  { id: 'boar-1', kind: 'boar', name: 'Thiết Giáp Trư', level: 3, position: { x: -24, y: 0, z: -18 }, maxHp: 185, hp: 185, radius: 1.3, respawnAt: null },
  { id: 'boar-2', kind: 'boar', name: 'Thiết Giáp Trư', level: 3, position: { x: -25, y: 0, z: -31 }, maxHp: 185, hp: 185, radius: 1.3, respawnAt: null },
  { id: 'shade-1', kind: 'shade', name: 'U Ảnh', level: 5, position: { x: 24, y: 0, z: -29 }, maxHp: 340, hp: 340, radius: 1.1, respawnAt: null },
];

export class World {
  private readonly players = new Map<string, LivePlayer>();
  private readonly monsters = new Map(MONSTER_SPAWNS.map((monster) => [monster.id, { ...monster, position: { ...monster.position } }]));
  private readonly herbs = new Map<string, number>();
  private readonly actionQueues = new Map<string, Promise<unknown>>();
  private readonly monsterAttackAt = new Map<string, number>();
  private readonly drops = new Map<string, WorldDrop>();
  private readonly formations = new Map<string, FormationState>();
  private readonly boss: BossState = {
    id: 'world-boss', name: 'Huyền Thiên Cổ Long', position: { x: 0, y: 0, z: -33 },
    hp: 850, maxHp: 850, respawnAt: null,
  };
  private readonly contributors = new Set<string>();
  private bossAttackAt = Date.now() + 10_000;
  private lastTickAt = Date.now();
  private nextSnapshotAt = 0;
  private nextCharacterAt = 0;
  private nextPersistAt = 0;
  private nextRosterAt = 0;
  private nextRoleCheckAt = 0;
  private saving = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly io: Server, private readonly store: CharacterStore, private readonly cache: GameCache) {
    this.timer = setInterval(() => this.tick(), 50);
  }

  /** Serialize per-character transactions (claims, purchases, casts) to prevent duplicate rewards. */
  private serialize<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.actionQueues.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    this.actionQueues.set(id, current);
    void current.then(() => { if (this.actionQueues.get(id) === current) this.actionQueues.delete(id); },
      () => { if (this.actionQueues.get(id) === current) this.actionQueues.delete(id); });
    return current;
  }

  /** REST endpoint and socket state use the SAME server-owned daily draw. */
  async dailyQuests(uid: string): Promise<{ day: string; quests: CharacterState['dailyQuests'] } | null> {
    const live = [...this.players.values()].find((s) => s.identity.uid === uid);
    if (live) return this.serialize(live.character.id, async () => {
      if (ensureDaily(live.character)) await this.sync(live);
      return { day: live.character.dailyDay, quests: live.character.dailyQuests };
    });
    const c = await this.store.get(uid);
    if (!c) return null;
    if (ensureDaily(c)) await this.store.save(c);
    return { day: c.dailyDay, quests: c.dailyQuests };
  }

  async join(socket: Socket, identity: Identity): Promise<void> {
    let character = await this.store.get(identity.uid);
    if (!character) { socket.emit('fatal', 'Hãy tạo nhân vật trước khi vào thế giới.'); socket.disconnect(true); return; }
    // A verified claim is not a DB role. Only the intersection confers any admin status.
    const authorized = identity.isAdmin && await this.store.hasAdminRole(identity.uid);
    const effectiveIdentity: Identity = { ...identity, isAdmin: authorized };
    // One live socket per verified identity. Transfer the LIVE state, not an old DB snapshot.
    const previous = [...this.players.values()].find((p) => p.identity.uid === identity.uid);
    if (previous) {
      this.players.delete(previous.character.id);
      previous.socket.disconnect(true);
      if (previous.trial) this.cancelTrial(previous);
      await this.store.save(previous.character);
      character = structuredClone(previous.character);
    }
    // A stored dev flag is NOT an authorization token. Restore normal stats on demotion.
    if (character.devMode && !authorized && !isLocalDevIdentity(identity)) {
      revokeDevMode(character);
      await this.store.save(character);
    }
    // One-time migration: old single-island saves had the wilderness at Z < 2.
    // Versioning matters: a new player at Z < 2 on the sect map must NOT migrate on reconnect.
    const legacyWorld = (character.worldVersion ?? 1) < 2;
    if (legacyWorld) {
      if (character.scene === 'overworld' && character.position.z < PORTALS.overworld.position.z) character.scene = 'wilderness';
      character.worldVersion = 2;
    }
    // A disconnected trial never grants a breakthrough or leaves a stuck instance.
    const interruptedTrial = character.scene === 'tribulation';
    if (interruptedTrial) {
      character.scene = 'overworld';
      character.position = { ...PORTALS.wilderness.arrival };
    }
    if (ensureDaily(character) || legacyWorld || interruptedTrial) await this.store.save(character);
    const retainedCooldowns = await this.cache.cooldowns(character.id);
    const s: LivePlayer = {
      identity: effectiveIdentity, character, socket, input: { x: 0, z: 0 }, lastInputAt: 0,
      cooldowns: new Map(Object.entries(retainedCooldowns)), lastChatAt: 0, lastAdminAt: 0, lastAppearanceAt: 0,
      casting: false, shieldUntil: 0,
      guardUntil: 0, trial: null, respawnAt: 0,
    };
    this.players.set(character.id, s);
    socket.emit('character', own(s));
    socket.emit('cooldowns', retainedCooldowns);
    socket.emit('notice', `Chào mừng ${character.name} trở lại Vân Thượng!`);
    await this.cache.update(character, effectiveIdentity.isAdmin || isLocalDevIdentity(effectiveIdentity));
    this.registerEvents(s);
    socket.on('disconnect', () => { void this.leave(s); });
    this.sendSnapshots();
  }

  private registerEvents(s: LivePlayer): void {
    const { socket } = s;
    const action = (handler: (payload: unknown) => Promise<string | void>) =>
      (payload: unknown, ack?: Ack) => {
        void this.serialize(s.character.id, async () => {
          // This socket may already have been replaced by a newer login.
          if (this.players.get(s.character.id) !== s) throw new Error('Phiên đăng nhập không còn hiệu lực.');
          await this.checkAdminRole(s);
          const text = await handler(payload);
          return { ok: true, message: typeof text === 'string' ? text : undefined, character: own(s) } as ActionResult;
        }).then((result) => ack?.(result), (error) => ack?.({ ok: false, error: message(error) }));
      };

    socket.on('input', (payload: unknown) => {
      if (this.players.get(s.character.id) !== s || !payload || typeof payload !== 'object') return;
      const { x, z, rotation } = payload as Record<string, unknown>;
      if (typeof x !== 'number' || typeof z !== 'number' || typeof rotation !== 'number' ||
          !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(rotation) ||
          Math.abs(x) > 1.01 || Math.abs(z) > 1.01 || Math.abs(rotation) > 100_000) return;
      const length = Math.hypot(x, z);
      s.input = { x: length > 1 ? x / length : x, z: length > 1 ? z / length : z };
      s.character.rotation = Math.atan2(Math.sin(rotation), Math.cos(rotation));
      s.lastInputAt = Date.now();
    });

    socket.on('portal:travel', action(async () => this.travel(s)));
    socket.on('cast', action(async (payload: unknown) => this.cast(s, payload)));
    socket.on('basic-attack', action(async (payload: unknown) => this.basicAttack(s, payload)));
    socket.on('cultivate', action(async () => {
      if (s.character.scene === 'tribulation') throw new Error('Không thể tĩnh tọa giữa lôi kiếp.');
      ensureDaily(s.character);
      const gained = gainCultivation(s.character);
      if (!gained) return 'Linh khí đang tụ lại. Hãy chờ thêm một chút.';
      advanceDaily(s.character, 'cultivate', gained);
      await this.sync(s);
      return `Tĩnh tọa hấp thu ${gained.toLocaleString('vi-VN')} tu vi.`;
    }));
    socket.on('advance-stage', action(async () => {
      if (s.character.scene === 'tribulation' || s.character.hp <= 0) throw new Error('Không thể thăng tầng lúc này.');
      advanceMinorStage(s.character);
      await this.sync(s);
      return `Thăng lên ${REALMS[s.character.realm]} tầng ${s.character.minorStage}! +${LEVEL_CONFIG.minorReward.maxHp} HP, +${LEVEL_CONFIG.minorReward.maxMp} Chân Khí vĩnh viễn.`;
    }));
    socket.on('breakthrough', action(async (payload: unknown) => this.beginTrial(s, payload)));
    socket.on('guard', action(async () => this.guard(s)));
    socket.on('choose-path', action(async (payload: unknown) => {
      const path = (payload as Record<string, unknown> | null)?.path;
      if (s.character.realm < 2 || s.character.path || s.character.scene === 'tribulation') throw new Error('Cần đạt Trúc Cơ và chưa từng chọn đạo.');
      if (path !== 'kiem' && path !== 'phap' && path !== 'the') throw new Error('Đạo tu không hợp lệ.');
      s.character.path = path as Path;
      // Choosing a path teaches its first technique; advanced books come from the Sect Shop.
      const starter = skillsForPath(s.character.path)[1].id;
      if (!s.character.learnedSkills.includes(starter)) s.character.learnedSkills.push(starter);
      s.character.hotbar[1] = starter;
      await this.sync(s);
      return `Đã bước lên con đường ${path === 'kiem' ? 'Kiếm Tu' : path === 'phap' ? 'Pháp Tu' : 'Thể Tu'}. Đã lĩnh ngộ ${SKILLS[starter].name}.`;
    }));
    socket.on('equip', action(async (payload: unknown) => {
      const instanceId = (payload as Record<string, unknown> | null)?.instanceId;
      if (typeof instanceId !== 'string' || s.character.scene === 'tribulation') throw new Error('Không thể trang bị lúc này.');
      const slot = equipItem(s.character, instanceId);
      await this.sync(s);
      return `Đã thay trang bị vào ô ${slot}.`;
    }));
    socket.on('craft', action(async (payload: unknown) => this.craft(s, payload)));
    socket.on('gather', action(async (payload: unknown) => this.gather(s, payload)));
    socket.on('quest:claim', action(async (payload: unknown) => this.claimQuest(s, payload)));
    socket.on('quest:deliver', action(async (payload: unknown) => this.deliverLetter(s, payload)));
    socket.on('sect:story', action(async () => this.story(s)));
    socket.on('sect:promote', action(async () => this.promote(s)));
    socket.on('shop:buy', action(async (payload: unknown) => this.buy(s, payload)));
    socket.on('use-item', action(async (payload: unknown) => this.useItem(s, payload)));
    socket.on('assign-hotbar', action(async (payload: unknown) => this.assignHotbar(s, payload)));
    socket.on('appearance:update', action(async (payload: unknown) => {
      if (s.character.scene === 'tribulation') throw new Error('Không thể thay đổi ngoại hình trong lôi kiếp.');
      if (Date.now() - s.lastAppearanceAt < 3000) throw new Error('Hãy đợi ba giây trước khi thay đổi tiếp.');
      const appearance = parseAppearance((payload as Record<string, unknown> | null)?.appearance);
      s.character.appearance = appearance;
      s.lastAppearanceAt = Date.now();
      await this.sync(s);
      this.sendSnapshots();
      return 'Ngoại hình đã được lưu.';
    }));
    socket.on('place-array', action(async () => this.placeArray(s)));
    socket.on('pickup', action(async (payload: unknown) => this.pickup(s, payload)));
    socket.on('chat', (payload: unknown, ack?: Ack) => {
      if (typeof payload === 'string' && payload.trim().toLowerCase() === '/devmode') {
        action(async () => this.enableDevMode(s))(payload, (result) => {
          ack?.(result);
          s.socket.emit('notice', result.ok ? result.message : result.error);
        });
      } else this.chat(s, payload);
    });
    socket.on('admin:action', action(async (payload: unknown) => this.adminAction(s, payload)));
  }

  private async checkAdminRole(s: LivePlayer): Promise<void> {
    if (!s.identity.isAdmin || await this.store.hasAdminRole(s.identity.uid)) return;
    s.identity = { ...s.identity, isAdmin: false };
    if (s.character.devMode) {
      revokeDevMode(s.character);
      await this.sync(s);
    } else s.socket.emit('character', own(s));
    this.sendSnapshots();
  }

  private async sync(s: LivePlayer): Promise<void> {
    await this.store.save(s.character);
    await this.cache.update(s.character, s.identity.isAdmin || isLocalDevIdentity(s.identity));
    s.socket.emit('character', own(s));
  }

  private async leave(s: LivePlayer): Promise<void> {
    if (this.players.get(s.character.id) !== s) return;
    this.players.delete(s.character.id);
    if (s.trial) this.cancelTrial(s);
    s.input = { x: 0, z: 0 };
    try { await this.store.save(s.character); await this.cache.removePosition(s.character.id); }
    catch (error) { console.error('[world] Failed to save departing player:', error); }
    this.sendSnapshots();
  }

  private god(s: LivePlayer): boolean { return hasDevPower(s.character, s.identity); }

  /** The request contains no destination or position. Only the server's current scene and gate decide travel. */
  private async travel(s: LivePlayer): Promise<string> {
    const c = s.character;
    if (c.scene === 'tribulation' || s.trial || c.hp <= 0) throw new Error('Không thể dùng cổng dịch chuyển lúc này.');
    const gate = PORTALS[c.scene];
    if (distanceXZ(c.position, gate.position) > gate.radius) throw new Error(`Hãy đến gần ${gate.name} để dịch chuyển.`);
    c.scene = gate.destination;
    c.position = { ...gate.arrival };
    c.rotation = gate.destination === 'wilderness' ? Math.PI : 0;
    s.input = { x: 0, z: 0 };
    s.lastInputAt = 0;
    await this.sync(s);
    this.sendSnapshots();
    return gate.destination === 'wilderness' ? 'Đã đến Hoang Vực. Hãy săn quái và hái linh thảo; quay về bằng Cổng Hồi Tông.' :
      'Đã trở lại Tông Môn. Chính Điện và các trưởng lão đang ở phía trước.';
  }

  /** No client-supplied damage, hit, HP or position is ever used for collision. */
  private hitEnemies(s: LivePlayer, shape: 'line' | 'sphere' | 'cone', range: number, radius: number,
    center: Vector3, baseDamage: number, skillId?: string): { count: number; total: number; crit: boolean } {
    const c = s.character;
    if (c.scene !== 'wilderness') return { count: 0, total: 0, crit: false };
    const origin = { ...c.position };
    const buffed = [...this.formations.values()].some((f) => f.scene === c.scene && distanceXZ(origin, f.position) <= f.radius);
    const stats = equippedStats(c);
    let count = 0, total = 0, crit = false;
    const damageFor = (hp: number) => {
      const critical = randomInt(100) < 12 + (c.root.tier === 'bien_di' ? 8 : 0);
      const damage = this.god(s) ? hp : Math.max(1, Math.round((baseDamage + c.realm * 9 + stats.attack * 1.4) *
        (buffed ? 1.2 : 1) * (critical ? 1.65 : 1)));
      count++; total += damage; crit ||= critical;
      return { damage, critical };
    };
    if (this.boss.hp > 0 && hitsTarget(shape, origin, c.rotation, this.boss.position, range, radius, 2.15, center)) {
      const { damage, critical } = damageFor(this.boss.hp);
      this.boss.hp = Math.max(0, this.boss.hp - damage);
      this.contributors.add(c.id);
      this.combat({ type: 'hit', skillId, sourceId: c.id, targetId: this.boss.id,
        position: { ...this.boss.position }, damage, critical, at: Date.now() });
      if (this.boss.hp === 0) this.defeatBoss(s);
    }
    for (const monster of this.monsters.values()) {
      if (monster.hp <= 0 || !hitsTarget(shape, origin, c.rotation, monster.position, range, radius, monster.radius, center)) continue;
      const { damage, critical } = damageFor(monster.hp);
      monster.hp = Math.max(0, monster.hp - damage);
      this.combat({ type: 'monster-hit', skillId, sourceId: c.id, targetId: monster.id,
        position: { ...monster.position }, damage, critical, at: Date.now() });
      if (monster.hp === 0) this.defeatMonster(s, monster);
    }
    return { count, total, crit };
  }

  private defeatMonster(s: LivePlayer, monster: MonsterState): void {
    monster.respawnAt = Date.now() + (monster.kind === 'shade' ? 24_000 : 12_000);
    const c = s.character;
    c.resources.stones += 2 + monster.level;
    c.cultivation += 15 * monster.level;
    c.totalCultivation += 15 * monster.level;
    c.storyKills++;
    ensureDaily(c);
    advanceDaily(c, monster.kind);
    if (randomInt(100) < 30) c.resources.herbs++;
    if (randomInt(100) < 5 && this.drops.size < 80) this.dropItem(monster.kind === 'shade' ? 'jade_blade' : 'cloud_boots', monster.position);
    s.socket.emit('notice', `Hạ ${monster.name}: +${15 * monster.level} EXP, +${2 + monster.level} linh thạch.`);
  }

  private async basicAttack(s: LivePlayer, _payload: unknown): Promise<string> {
    const c = s.character;
    if (c.scene !== 'wilderness' || c.hp <= 0) throw new Error('Chỉ được xuất kiếm ở Hoang Vực.');
    if (!this.god(s)) {
      const ticket = await this.cache.reserveCooldown(c.id, 'basic_attack', 650);
      if (!ticket.allowed) throw new Error('Đòn đánh thường đang hồi.');
    }
    this.combat({ type: 'swing', sourceId: c.id, position: { ...c.position }, at: Date.now() });
    const result = this.hitEnemies(s, 'line', 3.8, 0.85, c.position, 12, 'basic_attack');
    if (result.count) { await this.sync(s); this.sendSnapshots(); }
    return result.count ? `Chém trúng ${result.count} mục tiêu · ${result.total.toLocaleString('vi-VN')} sát thương${result.crit ? ' · BẠO KÍCH!' : ''}` : 'Đòn đánh trượt. Tiến gần và hướng mặt về quái.';
  }

  private async cast(s: LivePlayer, payload: unknown): Promise<string> {
    if (s.casting) throw new Error('Hãy để chiêu trước hoàn tất.');
    const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
    const skill = typeof data.skillId === 'string' && Object.hasOwn(SKILLS, data.skillId) ? SKILLS[data.skillId] : undefined;
    if (!skill) throw new Error('Kỹ năng không tồn tại.');
    const c = s.character;
    if (c.scene === 'tribulation' || c.hp <= 0) throw new Error('Không thể xuất chiêu lúc này.');
    if (!c.learnedSkills.includes(skill.id)) throw new Error('Hãy học sách công pháp trước khi sử dụng kỹ năng.');
    if (skill.path && (c.path !== skill.path || c.realm < 2)) throw new Error('Bạn chưa lĩnh ngộ kỹ năng này.');
    if (skill.id !== 'healing_bloom' && c.scene !== 'wilderness') throw new Error('Tông Môn là khu vực an toàn: không thể tấn công.');
    if (data.targetId !== undefined && data.targetId !== this.boss.id &&
      (typeof data.targetId !== 'string' || !this.monsters.has(data.targetId))) throw new Error('Mục tiêu không hợp lệ.');
    if (skill.id === 'healing_bloom' && c.hp >= c.maxHp) throw new Error('Sinh lực đã đầy.');
    if (!this.god(s) && c.mp < skill.mana) throw new Error('Không đủ chân khí.');
    s.casting = true;
    try {
      const ticket = this.god(s) ? { allowed: true, readyAt: Date.now() } :
        await this.cache.reserveCooldown(c.id, skill.id, skill.cooldown * 1000);
      if (!ticket.allowed) throw new Error(`Chiêu thức đang hồi (${Math.ceil((ticket.readyAt - Date.now()) / 1000)}s).`);
      const now = Date.now();
      const origin = { ...c.position };
      const target = c.scene === 'wilderness' ? data.targetId === this.boss.id ? this.boss :
        typeof data.targetId === 'string' ? this.monsters.get(data.targetId) : undefined : undefined;
      const targetAlive = target && target.hp > 0 && distanceXZ(origin, target.position) <= skill.range;
      // The impact position always comes from server state, never a client-provided vector.
      const sphereCenter = skill.range <= 1 ? origin : targetAlive ? { ...target.position } :
        { x: origin.x + Math.sin(c.rotation) * Math.min(skill.range, 7), y: 0, z: origin.z + Math.cos(c.rotation) * Math.min(skill.range, 7) };
      if (!this.god(s)) c.mp -= skill.mana;
      if (skill.id === 'diamond_body') s.shieldUntil = now + 6500;
      if (!this.god(s)) s.cooldowns.set(skill.id, ticket.readyAt);
      s.socket.emit('cooldowns', Object.fromEntries(s.cooldowns));
      this.combat({ type: 'cast', skillId: skill.id, sourceId: c.id, position: { ...sphereCenter }, origin, at: now }, undefined, c.scene);
      if (skill.id === 'healing_bloom') {
        const amount = Math.min(80, c.maxHp - c.hp);
        c.hp += amount;
        this.combat({ type: 'heal', skillId: skill.id, sourceId: c.id, targetId: c.id, position: origin, damage: amount, at: now }, undefined, c.scene);
        await this.sync(s);
        return `Thanh Liên Dưỡng Khí: hồi ${amount} HP.`;
      }
      const result = this.hitEnemies(s, skill.shape, skill.range, skill.radius, sphereCenter, skill.damage, skill.id);
      if (result.count && skill.path === 'the' && !this.god(s)) c.hp = Math.min(c.maxHp, c.hp + Math.round(result.total * (skill.ultimate ? 0.3 : 0.12)));
      await this.sync(s);
      if (result.count) this.sendSnapshots();
      return result.count ? `${skill.name}: ${result.total.toLocaleString('vi-VN')} sát thương lên ${result.count} mục tiêu${result.crit ? ' · BẠO KÍCH!' : ''}` :
        skill.id === 'diamond_body' ? 'Kim Cang Hộ Thể: hộ thân trong 6 giây.' : 'Chiêu thức không trúng mục tiêu. Hãy tiến gần hoặc đổi hướng.';
    } finally { s.casting = false; }
  }

  private defeatBoss(killer: LivePlayer): void {
    this.boss.respawnAt = Date.now() + 30_000;
    this.bossAttackAt = this.boss.respawnAt + 8000;
    for (const id of this.contributors) {
      const contributor = this.players.get(id);
      if (!contributor || contributor.character.scene !== 'wilderness') continue;
      contributor.character.resources.stones += 18;
      contributor.character.resources.herbs += 2;
      contributor.character.resources.ore += 1;
      contributor.character.bossKills++;
      contributor.character.cultivation += 85;
      contributor.character.totalCultivation += 85;
      contributor.socket.emit('character', own(contributor));
    }
    this.contributors.clear();
    const prize = ['cloud_crown', 'spirit_ring', 'jade_necklace', 'immortal_sword'][randomInt(4)];
    this.dropItem(prize, this.boss.position);
    this.noticeInZone('wilderness', `${killer.character.name} đã hạ Huyền Thiên Cổ Long! Chiến lợi phẩm xuất hiện.`);
  }

  private noticeInZone(scene: WorldZone, text: string): void {
    for (const player of this.players.values()) if (player.character.scene === scene) player.socket.emit('notice', text);
  }

  private dropItem(itemId: string, position: Vector3, scene: WorldZone = 'wilderness'): void {
    const id = randomUUID();
    this.drops.set(id, { id, itemId, scene, position: { ...position }, expiresAt: Date.now() + 90_000 });
  }

  private async pickup(s: LivePlayer, payload: unknown): Promise<string> {
    const id = (payload as Record<string, unknown> | null)?.dropId;
    if (typeof id !== 'string' || s.character.scene === 'tribulation') throw new Error('Vật phẩm không hợp lệ.');
    const drop = this.drops.get(id);
    if (!drop || drop.scene !== s.character.scene || drop.expiresAt <= Date.now()) throw new Error('Vật phẩm đã biến mất hoặc ở vùng khác.');
    if (distanceXZ(s.character.position, drop.position) > 3.5) throw new Error('Hãy đi đến gần vật phẩm hơn.');
    addItem(s.character, drop.itemId);
    this.drops.delete(id); // a drop can only be claimed once
    await this.sync(s);
    this.sendSnapshots();
    return `Nhặt được ${ITEMS[drop.itemId].name}!`;
  }

  private async craft(s: LivePlayer, payload: unknown): Promise<string> {
    const recipeId = (payload as Record<string, unknown> | null)?.recipeId;
    const recipe = typeof recipeId === 'string' && Object.hasOwn(RECIPES, recipeId) ? RECIPES[recipeId] : undefined;
    if (!recipe || s.character.scene === 'tribulation') throw new Error('Công thức không hợp lệ.');
    if (recipe.itemId && s.character.inventory.length >= 80) throw new Error('Túi đồ đã đầy.');
    if (!this.god(s)) {
      for (const [key, amount] of Object.entries(recipe.cost)) {
        if (s.character.resources[key as keyof typeof s.character.resources] < amount) throw new Error('Không đủ nguyên liệu để chế tạo.');
      }
      for (const [key, amount] of Object.entries(recipe.cost)) s.character.resources[key as keyof typeof s.character.resources] -= amount;
    }
    if (recipe.itemId) addItem(s.character, recipe.itemId);
    if (recipe.reward) for (const [key, amount] of Object.entries(recipe.reward)) s.character.resources[key as keyof typeof s.character.resources] += amount;
    await this.sync(s);
    return `Chế tạo ${recipe.name} thành công!`;
  }

  private async gather(s: LivePlayer, payload: unknown): Promise<string> {
    const nodeId = (payload as Record<string, unknown> | null)?.nodeId;
    const node = HERB_NODES.find((entry) => entry.id === nodeId);
    const c = s.character;
    if (!node || c.scene !== 'wilderness' || c.hp <= 0 || distanceXZ(c.position, node.position) > 2.7)
      throw new Error('Hãy lại gần bụi linh thảo ngoài Tông Môn.');
    const now = Date.now();
    if ((this.herbs.get(node.id) ?? 0) > now) throw new Error('Linh thảo đang tái sinh.');
    this.herbs.set(node.id, now + 10_000);
    ensureDaily(c);
    c.resources.herbs++;
    advanceDaily(c, 'gather');
    await this.sync(s);
    this.sendSnapshots();
    return 'Hái được một Linh thảo! Bụi thuốc hồi sinh sau 10 giây.';
  }

  private async claimQuest(s: LivePlayer, payload: unknown): Promise<string> {
    requireNpc(s.character, 'quest');
    ensureDaily(s.character);
    const questId = (payload as Record<string, unknown> | null)?.questId;
    const text = claimDaily(s.character, questId);
    await this.sync(s);
    return text;
  }

  private async deliverLetter(s: LivePlayer, payload: unknown): Promise<string> {
    const npcId = (payload as Record<string, unknown> | null)?.npcId;
    if (npcId !== 'master' && npcId !== 'shop') throw new Error('Người nhận thư không hợp lệ.');
    requireNpc(s.character, npcId);
    ensureDaily(s.character);
    if (!advanceDaily(s.character, npcId)) throw new Error('Hôm nay không có thư cần chuyển đến NPC này.');
    await this.sync(s);
    return `Đã chuyển thư cho ${NPCS[npcId].name}. Gặp Trưởng Lão Chấp Sự để nhận thưởng.`;
  }

  private async story(s: LivePlayer): Promise<string> {
    const c = s.character;
    requireNpc(c, 'master');
    if (c.storyStep === 0) {
      c.storyStep = 1;
      await this.sync(s);
      return 'Chưởng Môn: hãy hạ 3 yêu thú ngoài cổng để bảo vệ Tông Môn.';
    }
    if (c.storyStep === 1) {
      if (c.storyKills < 3) return `Chưởng Môn: bạn mới hạ ${c.storyKills}/3 yêu thú.`;
      c.storyStep = 2;
      c.resources.stones += 12; c.contribution += 20;
      c.cultivation += 200; c.totalCultivation += 200;
      await this.sync(s);
      return 'Đã hoàn thành chương 1! +200 EXP, +20 cống hiến. Chương 2: đánh bại Thế Giới Boss.';
    }
    if (c.storyStep === 2) {
      if (c.bossKills < 1) return 'Chưởng Môn: hãy góp công đánh bại Huyền Thiên Cổ Long.';
      c.storyStep = 3;
      c.resources.stones += 30; c.contribution += 50;
      c.cultivation += 500; c.totalCultivation += 500;
      await this.sync(s);
      return 'Cốt truyện tông môn hoàn tất! +500 EXP, +50 cống hiến. Tiếp tục thăng tầng tu luyện.';
    }
    return 'Chưởng Môn: đạo tâm đã vững. Hãy trợ giúp đồng môn trong Hoang Vực.';
  }

  private async promote(s: LivePlayer): Promise<string> {
    const c = s.character;
    requireNpc(c, 'master');
    const inner = c.sectRank === 'outer';
    if (!inner && c.sectRank !== 'inner') throw new Error('Bạn đã là đệ tử Chân truyền.');
    const realmNeeded = inner ? 2 : 3;
    const contribution = inner ? 50 : 150;
    if (c.realm < realmNeeded || (!this.god(s) && c.contribution < contribution))
      throw new Error(`Cần đạt ${REALMS[realmNeeded]} và có ${contribution} điểm cống hiến.`);
    if (!this.god(s)) c.contribution -= contribution;
    c.sectRank = inner ? 'inner' : 'true';
    await this.sync(s);
    return `Được Chưởng Môn sắc phong đệ tử ${inner ? 'Nội môn' : 'Chân truyền'}!`;
  }

  private async buy(s: LivePlayer, payload: unknown): Promise<string> {
    const c = s.character;
    requireNpc(c, 'shop');
    const offerId = (payload as Record<string, unknown> | null)?.offerId;
    const offer = SHOP_STOCK.find((entry) => entry.id === offerId);
    if (!offer) throw new Error('Cửa hàng không bán vật phẩm này.');
    if (!this.god(s) && (c.resources.stones < offer.stones || c.contribution < offer.contribution))
      throw new Error('Không đủ linh thạch hoặc điểm cống hiến.');
    if (offer.itemId && c.inventory.length >= 80) throw new Error('Túi đồ đã đầy (80/80).');
    if (offer.skillId) {
      const skill = SKILLS[offer.skillId];
      if (!skill || c.learnedSkills.includes(skill.id)) throw new Error('Công pháp đã học hoặc không hợp lệ.');
      if (skill.path && (c.path !== skill.path || c.realm < 2)) throw new Error('Sách chỉ dành cho đạo tu tương ứng từ Trúc Cơ.');
    }
    if (!this.god(s)) {
      c.resources.stones -= offer.stones;
      c.contribution -= offer.contribution;
    }
    if (offer.itemId) addItem(c, offer.itemId);
    if (offer.skillId) c.learnedSkills.push(offer.skillId);
    await this.sync(s);
    return offer.skillId ? `Đã lĩnh ngộ ${SKILLS[offer.skillId].name}. Mở Công Pháp để gán vào phím 1–4.` :
      `Mua ${ITEMS[offer.itemId!]?.name ?? CONSUMABLES[offer.itemId! as keyof typeof CONSUMABLES].name} thành công.`;
  }

  private async useItem(s: LivePlayer, payload: unknown): Promise<string> {
    const instanceId = (payload as Record<string, unknown> | null)?.instanceId;
    const c = s.character;
    if (typeof instanceId !== 'string' || c.scene === 'tribulation' || c.hp <= 0) throw new Error('Không thể dùng đan dược lúc này.');
    const index = c.inventory.findIndex((entry) => entry.instanceId === instanceId);
    const itemId = c.inventory[index]?.itemId;
    if (itemId !== 'heal_pill' && itemId !== 'mana_pill') throw new Error('Trúc Cơ Đan chỉ dùng khi bắt đầu độ kiếp.');
    if (itemId === 'heal_pill' && c.hp >= c.maxHp || itemId === 'mana_pill' && c.mp >= c.maxMp) throw new Error('Chỉ số đã đầy.');
    c.inventory.splice(index, 1);
    const amount = itemId === 'heal_pill' ? Math.min(70, c.maxHp - c.hp) : Math.min(90, c.maxMp - c.mp);
    if (itemId === 'heal_pill') c.hp += amount; else c.mp += amount;
    this.combat({ type: 'heal', sourceId: c.id, targetId: c.id, position: { ...c.position }, damage: amount, at: Date.now() }, undefined, c.scene);
    await this.sync(s);
    return `Dùng ${CONSUMABLES[itemId].name}: hồi ${amount} ${itemId === 'heal_pill' ? 'HP' : 'Chân Khí'}.`;
  }

  private async assignHotbar(s: LivePlayer, payload: unknown): Promise<string> {
    const { slot, skillId } = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
    const c = s.character;
    if (!Number.isInteger(slot) || typeof slot !== 'number' || slot < 0 || slot > 3) throw new Error('Ô hotbar phải là phím 1–4.');
    if (skillId !== null && (typeof skillId !== 'string' || !Object.hasOwn(SKILLS, skillId) || !c.learnedSkills.includes(skillId)))
      throw new Error('Bạn chưa học công pháp này.');
    if (typeof skillId === 'string' && SKILLS[skillId].path && (c.path !== SKILLS[skillId].path || c.realm < 2))
      throw new Error('Công pháp không dành cho đạo tu này.');
    if (skillId !== null && c.hotbar.some((id, index) => index !== slot && id === skillId)) throw new Error('Công pháp đã có trên hotbar.');
    c.hotbar[slot] = skillId;
    await this.sync(s);
    return `Đã gán công pháp vào phím ${slot + 1}.`;
  }

  private async enableDevMode(s: LivePlayer): Promise<string> {
    // Both gates are mandatory. Demo role always returns false; a forged chat name/role never grants power.
    if (!s.identity.isAdmin || !await this.store.hasAdminRole(s.identity.uid)) throw new Error('Lệnh /devmode chỉ dành cho quản trị viên được xác thực.');
    if (s.character.scene === 'tribulation' || s.trial) throw new Error('Hãy rời lôi kiếp trước khi kích hoạt dev mode.');
    if (!activateDevMode(s.character)) return 'Dev mode đã bật.';
    await this.sync(s);
    s.cooldowns.clear();
    s.socket.emit('cooldowns', {});
    console.info(`[audit] admin=${s.identity.uid} command=/devmode`);
    this.sendSnapshots();
    return 'DEV MODE: Tiên Đế tầng 9 · Hỗn Độn Linh Căn · Bất tử · không hồi chiêu · nhất kích diệt Boss.';
  }

  private async placeArray(s: LivePlayer): Promise<string> {
    const c = s.character;
    if (c.scene === 'tribulation' || c.hp <= 0) throw new Error('Không thể lập trận lúc này.');
    if (!this.god(s) && (c.resources.ink < 1 || c.resources.stones < 3)) throw new Error('Cần 1 phù mực và 3 linh thạch.');
    if ([...this.formations.values()].filter((formation) => formation.ownerId === c.id).length >= 2) throw new Error('Mỗi đạo hữu chỉ được duy trì tối đa hai pháp trận.');
    const ticket = this.god(s) ? { allowed: true, readyAt: Date.now() } : await this.cache.reserveCooldown(c.id, 'formation_pillar', 25_000);
    if (!ticket.allowed) throw new Error(`Trận pháp cần hồi ${Math.ceil((ticket.readyAt - Date.now()) / 1000)} giây.`);
    if (!this.god(s)) {
      c.resources.ink--;
      c.resources.stones -= 3;
    }
    const position = clampToWorld({ x: c.position.x + Math.sin(c.rotation) * 3, y: 0, z: c.position.z + Math.cos(c.rotation) * 3 }, WORLD_RADIUS - 5);
    const id = randomUUID();
    this.formations.set(id, { id, ownerId: c.id, scene: c.scene, position, radius: 5, expiresAt: Date.now() + 60_000 });
    await this.sync(s);
    this.sendSnapshots();
    return 'Tứ Tượng Trận đã mở! Đồng đội trong trận gây thêm 20% sát thương và hồi chân khí trong 60 giây.';
  }

  private async guard(s: LivePlayer): Promise<string> {
    const c = s.character;
    if (!s.trial || c.scene !== 'tribulation') throw new Error('Chỉ được xuất pháp bảo giữa lôi kiếp.');
    const instance = c.inventory.find((item) => item.instanceId === c.equipment.artifact);
    if (!instance || ITEMS[instance.itemId]?.slot !== 'artifact') throw new Error('Hãy trang bị Pháp Bảo Bản Mệnh trước khi độ kiếp.');
    if (!this.god(s) && c.mp < 18) throw new Error('Cần 18 chân khí để xuất pháp bảo.');
    const ticket = this.god(s) ? { allowed: true, readyAt: Date.now() } : await this.cache.reserveCooldown(c.id, 'trial_guard', 7000);
    if (!ticket.allowed) throw new Error(`Pháp bảo cần hồi ${Math.ceil((ticket.readyAt - Date.now()) / 1000)} giây.`);
    if (!this.god(s)) c.mp -= 18;
    s.guardUntil = Date.now() + 3500;
    s.trial.state.guarding = true;
    s.cooldowns.set('trial_guard', ticket.readyAt);
    s.socket.emit('cooldowns', Object.fromEntries(s.cooldowns));
    s.socket.emit('tribulation', { ...s.trial.state });
    await this.sync(s);
    return 'Bản Mệnh Châu đã xuất! Cản một đạo lôi trong 3,5 giây.';
  }

  private async beginTrial(s: LivePlayer, payload: unknown): Promise<string> {
    const c = s.character;
    const cost = breakthroughCost(c.realm, c.minorStage);
    if (!cost) throw new Error(c.realm >= MAX_REALM ? 'Bạn đã đạt Tiên Đế Đỉnh Phong.' : 'Cần đạt tầng 9 trước khi đột phá Đại cảnh giới.');
    if (c.scene === 'tribulation' || s.trial || c.hp <= 0) throw new Error('Không thể độ kiếp lúc này.');
    if (c.cultivation < cost) throw new Error(`Cần ${cost.toLocaleString('vi-VN')} tu vi để đột phá ${REALMS[c.realm + 1]}.`);
    const usePill = (payload as Record<string, unknown> | null)?.usePill === true;
    if (usePill) {
      const index = c.inventory.findIndex((owned) => owned.itemId === 'foundation_pill');
      if (index === -1) throw new Error('Bạn không có Trúc Cơ Đan trong túi.');
      c.inventory.splice(index, 1); // consumed at trial start, never duplicated after a disconnect
    }
    s.guardUntil = 0;
    s.trial = {
      returnPosition: { ...c.position }, returnScene: c.scene,
      state: { active: true, wave: 0, phase: 'waiting', target: null, nextAt: Date.now() + 1100, hits: 0, guarding: false, pillUsed: usePill },
    };
    c.scene = 'tribulation';
    c.position = { x: 0, y: 0, z: 0 };
    s.input = { x: 0, z: 0 };
    await this.sync(s);
    s.socket.emit('tribulation', s.trial.state);
    this.sendSnapshots();
    return `Lôi kiếp đã bắt đầu! Né chín vùng sấm đỏ; tỉ lệ thành công sau khi sống sót: ${Math.min(LEVEL_CONFIG.tribulation.maxSuccessPercent, LEVEL_CONFIG.tribulation.baseSuccessPercent + (usePill ? LEVEL_CONFIG.tribulation.pillBonusPercent : 0))}%.`;
  }

  private cancelTrial(s: LivePlayer): void {
    if (!s.trial) return;
    s.character.position = s.trial.returnPosition;
    s.character.scene = s.trial.returnScene;
    s.guardUntil = 0;
    s.trial = null;
  }

  private advanceTrial(s: LivePlayer, now: number): void {
    const trial = s.trial;
    if (!trial || now < trial.state.nextAt) return;
    const state = trial.state;
    if (state.guarding && s.guardUntil <= now) state.guarding = false;
    if (state.phase === 'waiting') {
      state.phase = 'warning';
      state.target = { ...s.character.position };
      state.nextAt = now + 1650;
    } else if (state.phase === 'warning') {
      state.phase = 'strike';
      state.nextAt = now + 500;
      if (state.target && distanceXZ(s.character.position, state.target) < 2.55) {
        const protectedByArtifact = s.guardUntil > now;
        if (protectedByArtifact) {
          s.guardUntil = 0;
          state.guarding = false;
          s.socket.emit('notice', 'Pháp Bảo Bản Mệnh đã chắn một đạo thiên lôi!');
        } else {
          state.hits++;
          if (!this.god(s)) s.character.hp = Math.max(0, s.character.hp - 24 - s.character.realm * 6);
        }
        this.combat({ type: 'lightning', targetId: s.character.id, position: state.target,
          damage: protectedByArtifact || this.god(s) ? 0 : 24 + s.character.realm * 6, at: now }, s.socket);
      } else {
        s.socket.emit('notice', 'Né được một đạo thiên lôi!');
      }
      if (s.character.hp <= 0 && !this.god(s)) {
        this.finishTrial(s, false);
        return;
      }
    } else {
      state.wave++;
      if (state.wave >= 9) { this.finishTrial(s, true); return; }
      state.phase = 'waiting';
      state.target = null;
      state.nextAt = now + 650;
    }
    s.socket.emit('tribulation', { ...state });
    s.socket.emit('character', own(s));
  }

  private finishTrial(s: LivePlayer, success: boolean): void {
    const trial = s.trial;
    if (!trial) return;
    const c = s.character;
    this.cancelTrial(s);
    const cost = breakthroughCost(c.realm, c.minorStage) ?? 0;
    const chance = Math.min(LEVEL_CONFIG.tribulation.maxSuccessPercent,
      LEVEL_CONFIG.tribulation.baseSuccessPercent + (trial.state.pillUsed ? LEVEL_CONFIG.tribulation.pillBonusPercent : 0));
    const passed = success && randomInt(100) < chance;
    if (passed) {
      completeMajorBreakthrough(c);
      s.socket.emit('notice', `Độ kiếp thành công! Đột phá ${REALMS[c.realm]} tầng 1. +100 Max HP, +200 Chân Khí vĩnh viễn.`);
    } else {
      c.cultivation = Math.max(0, c.cultivation - Math.ceil(cost / 4));
      c.hp = Math.ceil(c.maxHp / 2);
      s.socket.emit('notice', success ? `Vượt qua lôi kiếp nhưng đạo cơ không thành (${chance}% cơ hội). Hãy dưỡng thương và thử lại.` :
        'Độ kiếp thất bại. Tổn thất một phần tu vi; hãy dưỡng thương và thử lại.');
    }
    s.socket.emit('tribulation', { ...trial.state, active: false, target: null });
    s.socket.emit('character', own(s));
    void this.sync(s).catch((error) => console.error('[world] Trial save failed:', error));
    this.sendSnapshots();
  }

  private chat(s: LivePlayer, payload: unknown): void {
    if (typeof payload !== 'string' || this.players.get(s.character.id) !== s || Date.now() - s.lastChatAt < 1500) return;
    const text = payload.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 160);
    if (!text) return;
    s.lastChatAt = Date.now();
    const chat: ChatMessage = { id: randomUUID(), name: s.character.name, text, at: Date.now() };
    for (const player of this.players.values()) if (player.character.scene === s.character.scene) player.socket.emit('chat', chat);
  }

  private async adminAction(s: LivePlayer, payload: unknown): Promise<string> {
    if (!s.identity.isAdmin || !await this.store.hasAdminRole(s.identity.uid)) throw new Error('Không có quyền thực hiện hành động này.');
    if (!payload || typeof payload !== 'object') throw new Error('Hành động không hợp lệ.');
    if (Date.now() - s.lastAdminAt < 350) throw new Error('Thao tác quá nhanh, hãy thử lại.');
    s.lastAdminAt = Date.now();
    const data = payload as Record<string, unknown>;
    const action = data.type;
    console.info(`[audit] admin=${s.identity.uid} action=${String(action).slice(0, 40)} target=${String(data.targetId ?? data.itemId ?? '').slice(0, 70)}`);
    if (s.character.scene === 'tribulation') throw new Error('Thoát lôi kiếp trước khi sử dụng thần quyền.');
    if (action === 'spawn-item') {
      if (typeof data.itemId !== 'string' || !Object.hasOwn(ITEMS, data.itemId)) throw new Error('ID vật phẩm không hợp lệ.');
      if (this.drops.size >= 80) throw new Error('Thế giới có quá nhiều vật phẩm chưa được nhặt.');
      this.dropItem(data.itemId, clampToWorld({ x: s.character.position.x + Math.sin(s.character.rotation) * 3, y: 0, z: s.character.position.z + Math.cos(s.character.rotation) * 3 }, WORLD_RADIUS), s.character.scene);
      this.sendSnapshots();
      return `Đã triệu hồi ${ITEMS[data.itemId].name}.`;
    }
    if (action === 'spawn-boss') {
      if (data.bossId !== this.boss.id) throw new Error('ID Boss không nằm trong danh mục.');
      if (s.character.scene !== 'wilderness') throw new Error('Chỉ gọi Boss ở Hoang Vực bên ngoài Tông Môn.');
      this.boss.position = clampToWorld({ x: s.character.position.x + Math.sin(s.character.rotation) * 12, y: 0, z: s.character.position.z + Math.cos(s.character.rotation) * 12 }, WORLD_RADIUS - 4);
      this.boss.hp = this.boss.maxHp;
      this.boss.respawnAt = null;
      this.contributors.clear();
      this.sendSnapshots();
      return 'Thế giới xuất hiện Huyền Thiên Cổ Long.';
    }
    const target = typeof data.targetId === 'string' ? this.players.get(data.targetId) : undefined;
    if (!target || target.character.scene === 'tribulation') throw new Error('Người chơi không trực tuyến ở Tông Môn hoặc Hoang Vực.');
    if (action === 'teleport-to') {
      s.character.scene = target.character.scene;
      s.character.position = { ...target.character.position, x: target.character.position.x + 2 };
      clampToWorld(s.character.position, WORLD_RADIUS);
      s.input = { x: 0, z: 0 }; s.lastInputAt = 0;
      await this.sync(s);
      this.sendSnapshots();
      return `Đã dịch chuyển đến ${target.character.name}.`;
    }
    if (action === 'summon') {
      target.character.scene = s.character.scene;
      target.character.position = { ...s.character.position, x: s.character.position.x + 2 };
      clampToWorld(target.character.position, WORLD_RADIUS);
      target.input = { x: 0, z: 0 }; target.lastInputAt = 0;
      target.socket.emit('notice', 'Thiên đạo đã triệu hồi bạn đến vị trí của quản trị viên.');
      await this.sync(target);
      this.sendSnapshots();
      return `Đã triệu hồi ${target.character.name}.`;
    }
    if (action === 'lightning') {
      this.combat({ type: 'lightning', sourceId: s.character.id, targetId: target.character.id,
        position: { ...target.character.position }, damage: this.god(target) ? 0 : target.character.hp,
        at: Date.now() }, undefined, target.character.scene);
      if (!this.god(target)) {
        target.character.hp = 0;
        target.respawnAt = Date.now() + 2500;
        target.socket.emit('character', own(target));
      }
      return `Thiên phạt đã giáng xuống ${target.character.name}.`;
    }
    throw new Error('Hành động quản trị không được hỗ trợ.');
  }

  private combat(event: CombatEvent, only?: Socket, scene: WorldZone = 'wilderness'): void {
    if (only) { only.emit('combat', event); return; }
    for (const player of this.players.values()) {
      if (player.character.scene === scene) player.socket.emit('combat', event);
    }
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTickAt) / 1000));
    this.lastTickAt = now;
    for (const s of this.players.values()) {
      if (s.respawnAt && now >= s.respawnAt) {
        s.respawnAt = 0;
        s.character.hp = Math.ceil(s.character.maxHp * 0.6);
        s.character.mp = Math.ceil(s.character.maxMp * 0.6);
        s.character.scene = 'overworld';
        s.character.position = { ...PORTALS.wilderness.arrival };
        s.input = { x: 0, z: 0 }; s.lastInputAt = 0;
        s.socket.emit('character', own(s));
        s.socket.emit('notice', 'Thần hồn quy vị. Bạn đã hồi sinh tại Tông Môn.' );
      }
      if (now - s.lastInputAt <= 400 && (s.character.hp > 0 || this.god(s))) {
        const speed = this.god(s) ? 30 : 6;
        const previous = { ...s.character.position };
        s.character.position.x += s.input.x * speed * dt;
        s.character.position.z += s.input.z * speed * dt;
        clampToWorld(s.character.position, s.trial ? TRIAL_RADIUS : WORLD_RADIUS);
        if (!s.trial) {
          const zone = s.character.scene;
          const obstacles = [
            ...(zone === 'wilderness' && this.boss.hp > 0 ? [{ position: this.boss.position, radius: 2.7 }] : []),
            ...(zone === 'wilderness' ? [...this.monsters.values()].filter((m) => m.hp > 0)
              .map((m) => ({ position: m.position, radius: m.radius + 0.35 })) : []),
            ...[...this.players.values()].filter((p) => p !== s && p.character.scene === zone)
              .map((p) => ({ position: p.character.position, radius: 1.05 })),
          ];
          // Walls are swept AABBs: the only passage into each building is its visible doorway.
          // An already-overlapping spawn is allowed to walk OUT, not further in.
          if ((zone === 'overworld' && !canWalkInSect(previous, s.character.position)) ||
            obstacles.some((obstacle) => {
              const nextDistance = distanceXZ(s.character.position, obstacle.position);
              return nextDistance < obstacle.radius && nextDistance < distanceXZ(previous, obstacle.position);
            })) s.character.position = previous;
        }
      }
      if (s.trial) this.advanceTrial(s, now);
    }
    if (this.boss.hp === 0 && this.boss.respawnAt && now >= this.boss.respawnAt) {
      this.boss.hp = this.boss.maxHp;
      this.boss.respawnAt = null;
      this.noticeInZone('wilderness', 'Huyền Thiên Cổ Long đã thức tỉnh lần nữa!');
    }
    if (this.boss.hp > 0 && now >= this.bossAttackAt) {
      this.bossAttackAt = now + 8000;
      for (const s of this.players.values()) {
        if (s.character.scene !== 'wilderness' || s.character.hp <= 0 || distanceXZ(s.character.position, this.boss.position) > 11) continue;
        const inFormation = [...this.formations.values()].some((formation) => formation.scene === 'wilderness' && distanceXZ(s.character.position, formation.position) <= formation.radius);
        const base = Math.max(3, 27 - Math.floor(equippedStats(s.character).defense * 0.6));
        const damage = this.god(s) ? 0 : Math.max(1, Math.round(base * (inFormation ? 0.8 : 1) * (s.shieldUntil > now ? 0.25 : 1)));
        if (damage) s.character.hp = Math.max(0, s.character.hp - damage);
        this.combat({ type: 'boss-hit', sourceId: this.boss.id, targetId: s.character.id,
          position: { ...s.character.position }, damage, at: now });
        s.socket.emit('character', own(s));
        if (s.character.hp === 0) s.respawnAt = now + 3000;
      }
    }
    for (const monster of this.monsters.values()) {
      if (monster.hp <= 0) {
        if (monster.respawnAt && now >= monster.respawnAt) {
          monster.hp = monster.maxHp;
          monster.respawnAt = null;
          this.monsterAttackAt.set(monster.id, now + 2000);
        }
        continue;
      }
      if (now < (this.monsterAttackAt.get(monster.id) ?? 0)) continue;
      const nearby = [...this.players.values()].filter((p) => p.character.scene === 'wilderness' &&
        p.character.hp > 0 && distanceXZ(p.character.position, monster.position) < monster.radius + 1.8);
      if (!nearby.length) continue;
      this.monsterAttackAt.set(monster.id, now + 3300);
      const victim = nearby.sort((a, b) => distanceXZ(a.character.position, monster.position) - distanceXZ(b.character.position, monster.position))[0];
      const damage = this.god(victim) ? 0 : Math.max(2, monster.level * 5 - Math.floor(equippedStats(victim.character).defense / 3));
      victim.character.hp = Math.max(0, victim.character.hp - damage);
      this.combat({ type: 'monster-attack', sourceId: monster.id, targetId: victim.character.id,
        position: { ...victim.character.position }, damage, at: now });
      victim.socket.emit('character', own(victim));
      if (victim.character.hp === 0) victim.respawnAt = now + 3000;
    }
    for (const [id, drop] of this.drops) if (drop.expiresAt <= now) this.drops.delete(id);
    for (const [id, formation] of this.formations) if (formation.expiresAt <= now) this.formations.delete(id);
    if (now >= this.nextSnapshotAt) { this.nextSnapshotAt = now + 100; this.sendSnapshots(); }
    if (now >= this.nextCharacterAt) {
      this.nextCharacterAt = now + 1000;
      for (const s of this.players.values()) {
        if (ensureDaily(s.character, now)) void this.serialize(s.character.id, async () => this.sync(s))
          .catch((error) => console.error('[world] Daily reset save failed:', error));
        if (s.character.scene !== 'tribulation' && [...this.formations.values()].some((formation) =>
          formation.scene === s.character.scene && distanceXZ(s.character.position, formation.position) <= formation.radius)) {
          s.character.mp = Math.min(s.character.maxMp, s.character.mp + 2);
        }
        s.socket.emit('character', own(s));
      }
    }
    if (now >= this.nextRosterAt) { this.nextRosterAt = now + 1000; this.sendAdminRoster(); }
    if (now >= this.nextRoleCheckAt) {
      this.nextRoleCheckAt = now + 3000;
      for (const s of this.players.values()) if (s.identity.isAdmin) void this.serialize(s.character.id,
        async () => { if (this.players.get(s.character.id) === s) await this.checkAdminRole(s); })
        .catch((error) => console.error('[world] Admin role check failed:', error));
    }
    if (now >= this.nextPersistAt && !this.saving) {
      this.nextPersistAt = now + 10_000;
      void this.persistAll();
    }
  }

  private sendSnapshots(): void {
    const now = Date.now();
    for (const scene of ['overworld', 'wilderness'] as const) {
      const snapshot: WorldSnapshot = {
        scene, players: [...this.players.values()].filter((p) => p.character.scene === scene).map(publicPlayer),
        boss: scene === 'wilderness' ? { ...this.boss } : null,
        monsters: scene === 'wilderness' ? [...this.monsters.values()].map((m) => ({ ...m })) : [],
        herbs: scene === 'wilderness' ? HERB_NODES.map((node) =>
          ({ id: node.id, position: node.position, availableAt: this.herbs.get(node.id) ?? 0 })) : [],
        drops: [...this.drops.values()].filter((drop) => drop.scene === scene),
        formations: [...this.formations.values()].filter((formation) => formation.scene === scene), at: now,
      };
      for (const player of this.players.values()) if (player.character.scene === scene) player.socket.emit('world', snapshot);
    }
    for (const player of this.players.values()) if (player.character.scene === 'tribulation') {
      player.socket.emit('world', { scene: 'tribulation', players: [publicPlayer(player)],
        boss: null, monsters: [], herbs: [], drops: [], formations: [], at: now } satisfies WorldSnapshot);
    }
  }

  private sendAdminRoster(): void {
    const roster = [...this.players.values()].map((p) => ({
      id: p.character.id, name: p.character.name, position: { ...p.character.position },
      realm: p.character.realm, scene: p.character.scene, hp: this.god(p) ? GOD_STAT : p.character.hp,
    }));
    for (const s of this.players.values()) if (s.identity.isAdmin) s.socket.emit('admin:players', roster);
  }

  private async persistAll(): Promise<void> {
    this.saving = true;
    try {
      await Promise.all([...this.players.values()].map(async (s) => {
        await this.store.save(s.character);
        await this.cache.update(s.character, s.identity.isAdmin || isLocalDevIdentity(s.identity));
      }));
    } catch (error) { console.error('[world] Periodic persistence failed:', error); }
    finally { this.saving = false; }
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.persistAll();
  }
}
