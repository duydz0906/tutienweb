import { randomInt, randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  BREAKTHROUGH_COSTS, ITEMS, REALMS, RECIPES, SKILLS,
  type ActionResult, type BossState, type CharacterState, type ChatMessage,
  type CombatEvent, type FormationState, type OwnCharacter, type Path, type PublicPlayer,
  type TribulationState, type Vector3, type WorldDrop, type WorldSnapshot,
} from '@van-thuong/shared';
import type { Identity } from '../auth.js';
import type { CharacterStore } from '../db/store.js';
import type { GameCache } from '../db/cache.js';
import {
  addItem, breakthroughCost, clampToWorld, distanceXZ, equipItem,
  equippedStats, gainCultivation, GOD_STAT, hitsTarget, parseAppearance, TRIAL_RADIUS, WORLD_RADIUS,
} from './rules.js';

type Trial = { state: TribulationState; returnPosition: Vector3 };
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
  const { ownerUid: _privateUid, ...data } = s.character;
  return { ...data, hp: s.identity.isAdmin ? GOD_STAT : data.hp, mp: s.identity.isAdmin ? GOD_STAT : data.mp,
    maxHp: s.identity.isAdmin ? GOD_STAT : data.maxHp, maxMp: s.identity.isAdmin ? GOD_STAT : data.maxMp,
    isAdmin: s.identity.isAdmin, shieldUntil: s.shieldUntil };
}
function publicPlayer(s: LivePlayer): PublicPlayer {
  const c = s.character;
  return {
    id: c.id, name: c.name, position: c.position, rotation: c.rotation,
    hp: s.identity.isAdmin ? GOD_STAT : c.hp, maxHp: s.identity.isAdmin ? GOD_STAT : c.maxHp,
    realm: c.realm, path: c.path, root: c.root, gender: c.gender, appearance: c.appearance,
    equipment: Object.fromEntries(Object.entries(c.equipment).map(([slot, instanceId]) => {
      const item = c.inventory.find((ownedItem) => ownedItem.instanceId === instanceId);
      return [slot, item?.itemId];
    }).filter(([, id]) => id)) as PublicPlayer['equipment'],
    isAdmin: s.identity.isAdmin, shieldUntil: s.shieldUntil,
  };
}

export class World {
  private readonly players = new Map<string, LivePlayer>();
  private readonly drops = new Map<string, WorldDrop>();
  private readonly formations = new Map<string, FormationState>();
  private readonly boss: BossState = {
    id: 'world-boss', name: 'Huyền Thiên Cổ Long', position: { x: 0, y: 0, z: -12 },
    hp: 850, maxHp: 850, respawnAt: null,
  };
  private readonly contributors = new Set<string>();
  private bossAttackAt = Date.now() + 10_000;
  private lastTickAt = Date.now();
  private nextSnapshotAt = 0;
  private nextCharacterAt = 0;
  private nextPersistAt = 0;
  private nextRosterAt = 0;
  private saving = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly io: Server, private readonly store: CharacterStore, private readonly cache: GameCache) {
    this.timer = setInterval(() => this.tick(), 50);
  }

  async join(socket: Socket, identity: Identity): Promise<void> {
    let character = await this.store.get(identity.uid);
    if (!character) { socket.emit('fatal', 'Hãy tạo nhân vật trước khi vào thế giới.'); socket.disconnect(true); return; }
    // One live socket per verified identity. Transfer the LIVE state, not an old DB snapshot.
    const previous = [...this.players.values()].find((p) => p.identity.uid === identity.uid);
    if (previous) {
      this.players.delete(previous.character.id);
      previous.socket.disconnect(true);
      if (previous.trial) this.cancelTrial(previous);
      await this.store.save(previous.character);
      character = structuredClone(previous.character);
    }
    // A disconnected trial never grants a breakthrough or leaves a stuck instance.
    if (character.scene === 'tribulation') {
      character.scene = 'overworld';
      character.position = { x: 0, y: 0, z: 10 };
    }
    const retainedCooldowns = await this.cache.cooldowns(character.id);
    const s: LivePlayer = {
      identity, character, socket, input: { x: 0, z: 0 }, lastInputAt: 0,
      cooldowns: new Map(Object.entries(retainedCooldowns)), lastChatAt: 0, lastAdminAt: 0, lastAppearanceAt: 0,
      casting: false, shieldUntil: 0,
      guardUntil: 0, trial: null, respawnAt: 0,
    };
    this.players.set(character.id, s);
    socket.emit('character', own(s));
    socket.emit('cooldowns', retainedCooldowns);
    socket.emit('notice', `Chào mừng ${character.name} trở lại Vân Thượng!`);
    await this.cache.update(character, identity.isAdmin);
    this.registerEvents(s);
    socket.on('disconnect', () => { void this.leave(s); });
    this.sendSnapshots();
  }

  private registerEvents(s: LivePlayer): void {
    const { socket } = s;
    const action = (handler: (payload: any) => Promise<string | void>) =>
      (payload: unknown, ack?: Ack) => {
        void (async () => {
          try {
            // This socket may already have been replaced by a newer login.
            if (this.players.get(s.character.id) !== s) throw new Error('Phiên đăng nhập không còn hiệu lực.');
            const text = await handler(payload);
            ack?.({ ok: true, message: typeof text === 'string' ? text : undefined, character: own(s) });
          } catch (error) { ack?.({ ok: false, error: message(error) }); }
        })();
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

    socket.on('cast', action(async (payload: unknown) => this.cast(s, payload)));
    socket.on('cultivate', action(async () => {
      if (s.character.scene !== 'overworld') throw new Error('Không thể tĩnh tọa giữa lôi kiếp.');
      const gained = gainCultivation(s.character);
      if (!gained) return 'Linh khí đang tụ lại. Hãy chờ thêm một chút.';
      await this.sync(s);
      return `Tĩnh tọa hấp thu ${gained.toLocaleString('vi-VN')} tu vi.`;
    }));
    socket.on('breakthrough', action(async () => this.beginTrial(s)));
    socket.on('guard', action(async () => this.guard(s)));
    socket.on('choose-path', action(async (payload: unknown) => {
      const path = (payload as Record<string, unknown> | null)?.path;
      if (s.character.realm < 2 || s.character.path || s.character.scene !== 'overworld') throw new Error('Cần đạt Trúc Cơ và chưa từng chọn đạo.');
      if (path !== 'kiem' && path !== 'phap' && path !== 'the') throw new Error('Đạo tu không hợp lệ.');
      s.character.path = path as Path;
      await this.sync(s);
      return `Đã bước lên con đường ${path === 'kiem' ? 'Kiếm Tu' : path === 'phap' ? 'Pháp Tu' : 'Thể Tu'}.`;
    }));
    socket.on('equip', action(async (payload: unknown) => {
      const instanceId = (payload as Record<string, unknown> | null)?.instanceId;
      if (typeof instanceId !== 'string' || s.character.scene !== 'overworld') throw new Error('Không thể trang bị lúc này.');
      const slot = equipItem(s.character, instanceId);
      await this.sync(s);
      return `Đã thay trang bị vào ô ${slot}.`;
    }));
    socket.on('craft', action(async (payload: unknown) => this.craft(s, payload)));
    socket.on('appearance:update', action(async (payload: unknown) => {
      if (s.character.scene !== 'overworld') throw new Error('Không thể thay đổi ngoại hình trong lôi kiếp.');
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
    socket.on('chat', (payload: unknown) => this.chat(s, payload));
    socket.on('admin:action', action(async (payload: unknown) => this.adminAction(s, payload)));
  }

  private async sync(s: LivePlayer): Promise<void> {
    await this.store.save(s.character);
    await this.cache.update(s.character, s.identity.isAdmin);
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

  private async cast(s: LivePlayer, payload: unknown): Promise<string> {
    if (s.casting) throw new Error('Hãy để chiêu trước hoàn tất.');
    const data = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
    const skill = typeof data.skillId === 'string' ? SKILLS[data.skillId] : undefined;
    if (!skill) throw new Error('Kỹ năng không tồn tại.');
    if (s.character.scene !== 'overworld' || s.character.hp <= 0) throw new Error('Không thể xuất chiêu lúc này.');
    if (skill.path && (s.character.path !== skill.path || s.character.realm < 2)) throw new Error('Bạn chưa lĩnh ngộ kỹ năng này.');
    if (data.targetId !== undefined && data.targetId !== this.boss.id) throw new Error('Mục tiêu không hợp lệ.');
    if (!s.identity.isAdmin && s.character.mp < skill.mana) throw new Error('Không đủ chân khí.');
    s.casting = true;
    try {
      const ticket = await this.cache.reserveCooldown(s.character.id, skill.id, skill.cooldown * 1000);
      if (!ticket.allowed) throw new Error(`Chiêu thức đang hồi (${Math.ceil((ticket.readyAt - Date.now()) / 1000)}s).`);
      const c = s.character;
      const now = Date.now();
      const origin = { ...c.position };
      const bossDistance = distanceXZ(origin, this.boss.position);
      // The point of impact comes from server state, never a client-provided coordinate.
      const sphereCenter = skill.range <= 1 ? origin :
        data.targetId === this.boss.id && this.boss.hp > 0 && bossDistance <= skill.range
          ? this.boss.position
          : { x: origin.x + Math.sin(c.rotation) * Math.min(skill.range, 7), y: 0, z: origin.z + Math.cos(c.rotation) * Math.min(skill.range, 7) };
      if (!s.identity.isAdmin) c.mp -= skill.mana;
      if (skill.id === 'diamond_body') s.shieldUntil = now + 6500;
      s.cooldowns.set(skill.id, ticket.readyAt);
      s.socket.emit('cooldowns', Object.fromEntries(s.cooldowns));
      s.socket.emit('character', own(s));
      this.combat({ type: 'cast', skillId: skill.id, sourceId: c.id, position: { ...sphereCenter }, at: now });
      const hit = this.boss.hp > 0 && hitsTarget(skill.shape, origin, c.rotation, this.boss.position, skill.range, skill.radius, 2.15, sphereCenter);
      if (!hit) return skill.id === 'diamond_body' ? 'Kim Cang Hộ Thể: hộ thân trong 6 giây.' : 'Chiêu thức không trúng mục tiêu. Hãy tiến gần hoặc đổi hướng.';

      const stats = equippedStats(c);
      const critical = randomInt(100) < 12 + (c.root.tier === 'bien_di' ? 8 : 0);
      const buffed = [...this.formations.values()].some((formation) => distanceXZ(c.position, formation.position) <= formation.radius);
      const rawDamage = (skill.damage + c.realm * 9 + stats.attack * 1.4) * (buffed ? 1.2 : 1);
      const damage = s.identity.isAdmin ? this.boss.hp : Math.max(1, Math.round(rawDamage * (critical ? 1.65 : 1)));
      this.boss.hp = Math.max(0, this.boss.hp - damage);
      this.contributors.add(c.id);
      this.combat({ type: 'hit', skillId: skill.id, sourceId: c.id, targetId: this.boss.id,
        position: { ...this.boss.position }, damage, critical, at: now });
      if (skill.path === 'the' && !s.identity.isAdmin) {
        c.hp = Math.min(c.maxHp, c.hp + Math.round(damage * (skill.ultimate ? 0.3 : 0.12)));
        s.socket.emit('character', own(s));
      }
      if (this.boss.hp === 0) this.defeatBoss(s);
      return `${skill.name}: ${damage.toLocaleString('vi-VN')} sát thương${critical ? ' · BẠO KÍCH!' : ''}${buffed ? ' · TRẬN PHÁP!' : ''}`;
    } finally { s.casting = false; }
  }

  private defeatBoss(killer: LivePlayer): void {
    this.boss.respawnAt = Date.now() + 30_000;
    this.bossAttackAt = this.boss.respawnAt + 8000;
    for (const id of this.contributors) {
      const contributor = this.players.get(id);
      if (!contributor) continue;
      contributor.character.resources.stones += 18;
      contributor.character.resources.herbs += 2;
      contributor.character.resources.ore += 1;
      contributor.socket.emit('character', own(contributor));
    }
    this.contributors.clear();
    const prize = ['cloud_crown', 'spirit_ring', 'jade_necklace', 'immortal_sword'][randomInt(4)];
    this.dropItem(prize, this.boss.position);
    this.io.emit('notice', `${killer.character.name} đã hạ Huyền Thiên Cổ Long! Chiến lợi phẩm xuất hiện.`);
  }

  private dropItem(itemId: string, position: Vector3): void {
    const id = randomUUID();
    this.drops.set(id, { id, itemId, position: { ...position }, expiresAt: Date.now() + 90_000 });
  }

  private async pickup(s: LivePlayer, payload: unknown): Promise<string> {
    const id = (payload as Record<string, unknown> | null)?.dropId;
    if (typeof id !== 'string' || s.character.scene !== 'overworld') throw new Error('Vật phẩm không hợp lệ.');
    const drop = this.drops.get(id);
    if (!drop || drop.expiresAt <= Date.now()) throw new Error('Vật phẩm đã biến mất.');
    if (distanceXZ(s.character.position, drop.position) > 3.5) throw new Error('Hãy đi đến gần vật phẩm hơn.');
    addItem(s.character, drop.itemId);
    this.drops.delete(id); // a drop can only be claimed once
    await this.sync(s);
    this.sendSnapshots();
    return `Nhặt được ${ITEMS[drop.itemId].name}!`;
  }

  private async craft(s: LivePlayer, payload: unknown): Promise<string> {
    const recipeId = (payload as Record<string, unknown> | null)?.recipeId;
    const recipe = typeof recipeId === 'string' ? RECIPES[recipeId] : undefined;
    if (!recipe || s.character.scene !== 'overworld') throw new Error('Công thức không hợp lệ.');
    if (recipe.itemId && s.character.inventory.length >= 80) throw new Error('Túi đồ đã đầy.');
    for (const [key, amount] of Object.entries(recipe.cost)) {
      if (s.character.resources[key as keyof typeof s.character.resources] < amount) throw new Error('Không đủ nguyên liệu để chế tạo.');
    }
    for (const [key, amount] of Object.entries(recipe.cost)) s.character.resources[key as keyof typeof s.character.resources] -= amount;
    if (recipe.itemId) addItem(s.character, recipe.itemId);
    if (recipe.reward) for (const [key, amount] of Object.entries(recipe.reward)) s.character.resources[key as keyof typeof s.character.resources] += amount;
    await this.sync(s);
    return `Chế tạo ${recipe.name} thành công!`;
  }

  private async placeArray(s: LivePlayer): Promise<string> {
    const c = s.character;
    if (c.scene !== 'overworld' || c.hp <= 0) throw new Error('Không thể lập trận lúc này.');
    if (c.resources.ink < 1 || c.resources.stones < 3) throw new Error('Cần 1 phù mực và 3 linh thạch.');
    if ([...this.formations.values()].filter((formation) => formation.ownerId === c.id).length >= 2) throw new Error('Mỗi đạo hữu chỉ được duy trì tối đa hai pháp trận.');
    const ticket = await this.cache.reserveCooldown(c.id, 'formation_pillar', 25_000);
    if (!ticket.allowed) throw new Error(`Trận pháp cần hồi ${Math.ceil((ticket.readyAt - Date.now()) / 1000)} giây.`);
    c.resources.ink--;
    c.resources.stones -= 3;
    const position = clampToWorld({ x: c.position.x + Math.sin(c.rotation) * 3, y: 0, z: c.position.z + Math.cos(c.rotation) * 3 }, WORLD_RADIUS - 5);
    const id = randomUUID();
    this.formations.set(id, { id, ownerId: c.id, position, radius: 5, expiresAt: Date.now() + 60_000 });
    await this.sync(s);
    this.sendSnapshots();
    return 'Tứ Tượng Trận đã mở! Đồng đội trong trận gây thêm 20% sát thương và hồi chân khí trong 60 giây.';
  }

  private async guard(s: LivePlayer): Promise<string> {
    const c = s.character;
    if (!s.trial || c.scene !== 'tribulation') throw new Error('Chỉ được xuất pháp bảo giữa lôi kiếp.');
    const instance = c.inventory.find((item) => item.instanceId === c.equipment.artifact);
    if (!instance || ITEMS[instance.itemId]?.slot !== 'artifact') throw new Error('Hãy trang bị Pháp Bảo Bản Mệnh trước khi độ kiếp.');
    if (!s.identity.isAdmin && c.mp < 18) throw new Error('Cần 18 chân khí để xuất pháp bảo.');
    const ticket = await this.cache.reserveCooldown(c.id, 'trial_guard', 7000);
    if (!ticket.allowed) throw new Error(`Pháp bảo cần hồi ${Math.ceil((ticket.readyAt - Date.now()) / 1000)} giây.`);
    if (!s.identity.isAdmin) c.mp -= 18;
    s.guardUntil = Date.now() + 3500;
    s.trial.state.guarding = true;
    s.cooldowns.set('trial_guard', ticket.readyAt);
    s.socket.emit('cooldowns', Object.fromEntries(s.cooldowns));
    s.socket.emit('tribulation', { ...s.trial.state });
    await this.sync(s);
    return 'Bản Mệnh Châu đã xuất! Cản một đạo lôi trong 3,5 giây.';
  }

  private beginTrial(s: LivePlayer): string {
    const c = s.character;
    const cost = breakthroughCost(c.realm);
    if (!cost) throw new Error('Bạn đã đạt cảnh giới cao nhất trong bản thử nghiệm.');
    if (c.scene !== 'overworld' || s.trial || c.hp <= 0) throw new Error('Không thể độ kiếp lúc này.');
    if (c.cultivation < cost) throw new Error(`Cần ${cost} tu vi để đột phá ${REALMS[c.realm + 1]}.`);
    s.guardUntil = 0;
    s.trial = {
      returnPosition: { ...c.position },
      state: { active: true, wave: 0, phase: 'waiting', target: null, nextAt: Date.now() + 1100, hits: 0, guarding: false },
    };
    c.scene = 'tribulation';
    c.position = { x: 0, y: 0, z: 0 };
    s.input = { x: 0, z: 0 };
    s.socket.emit('tribulation', s.trial.state);
    s.socket.emit('character', own(s));
    this.sendSnapshots();
    return 'Lôi kiếp đã bắt đầu! Né chín vùng sấm đỏ bằng WASD.';
  }

  private cancelTrial(s: LivePlayer): void {
    if (!s.trial) return;
    s.character.position = s.trial.returnPosition;
    s.character.scene = 'overworld';
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
          if (!s.identity.isAdmin) s.character.hp = Math.max(0, s.character.hp - 24 - s.character.realm * 6);
        }
        this.combat({ type: 'lightning', targetId: s.character.id, position: state.target,
          damage: protectedByArtifact || s.identity.isAdmin ? 0 : 24 + s.character.realm * 6, at: now }, s.socket);
      } else {
        s.socket.emit('notice', 'Né được một đạo thiên lôi!');
      }
      if (s.character.hp <= 0 && !s.identity.isAdmin) {
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
    if (success) {
      c.cultivation -= BREAKTHROUGH_COSTS[c.realm];
      c.realm++;
      c.maxHp += 50;
      c.maxMp += 30;
      c.hp = c.maxHp;
      c.mp = c.maxMp;
      s.socket.emit('notice', `Độ kiếp thành công! Đột phá ${REALMS[c.realm]}.`);
    } else {
      c.cultivation = Math.max(0, c.cultivation - Math.ceil(BREAKTHROUGH_COSTS[c.realm] / 4));
      c.hp = Math.ceil(c.maxHp / 2);
      s.socket.emit('notice', 'Độ kiếp thất bại. Tổn thất một phần tu vi; hãy dưỡng thương và thử lại.');
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
    if (!s.identity.isAdmin) throw new Error('Không có quyền thực hiện hành động này.');
    if (!payload || typeof payload !== 'object') throw new Error('Hành động không hợp lệ.');
    if (Date.now() - s.lastAdminAt < 350) throw new Error('Thao tác quá nhanh, hãy thử lại.');
    s.lastAdminAt = Date.now();
    const data = payload as Record<string, unknown>;
    const action = data.type;
    console.info(`[audit] admin=${s.identity.uid} action=${String(action).slice(0, 40)} target=${String(data.targetId ?? data.itemId ?? '').slice(0, 70)}`);
    if (s.character.scene !== 'overworld') throw new Error('Thoát lôi kiếp trước khi sử dụng thần quyền.');
    if (action === 'spawn-item') {
      if (typeof data.itemId !== 'string' || !ITEMS[data.itemId]) throw new Error('ID vật phẩm không hợp lệ.');
      if (this.drops.size >= 80) throw new Error('Thế giới có quá nhiều vật phẩm chưa được nhặt.');
      this.dropItem(data.itemId, clampToWorld({ x: s.character.position.x + Math.sin(s.character.rotation) * 3, y: 0, z: s.character.position.z + Math.cos(s.character.rotation) * 3 }, WORLD_RADIUS));
      this.sendSnapshots();
      return `Đã triệu hồi ${ITEMS[data.itemId].name}.`;
    }
    if (action === 'spawn-boss') {
      if (data.bossId !== this.boss.id) throw new Error('ID Boss không nằm trong danh mục.');
      this.boss.position = clampToWorld({ x: s.character.position.x + Math.sin(s.character.rotation) * 12, y: 0, z: s.character.position.z + Math.cos(s.character.rotation) * 12 }, WORLD_RADIUS - 4);
      this.boss.hp = this.boss.maxHp;
      this.boss.respawnAt = null;
      this.contributors.clear();
      this.sendSnapshots();
      return 'Thế giới xuất hiện Huyền Thiên Cổ Long.';
    }
    const target = typeof data.targetId === 'string' ? this.players.get(data.targetId) : undefined;
    if (!target || target.character.scene !== 'overworld') throw new Error('Người chơi không trực tuyến ở ngoại giới.');
    if (action === 'teleport-to') {
      s.character.position = { ...target.character.position, x: target.character.position.x + 2 };
      clampToWorld(s.character.position, WORLD_RADIUS);
      await this.sync(s);
      return `Đã dịch chuyển đến ${target.character.name}.`;
    }
    if (action === 'summon') {
      target.character.position = { ...s.character.position, x: s.character.position.x + 2 };
      clampToWorld(target.character.position, WORLD_RADIUS);
      target.socket.emit('notice', 'Thiên đạo đã triệu hồi bạn đến vị trí của quản trị viên.');
      await this.sync(target);
      return `Đã triệu hồi ${target.character.name}.`;
    }
    if (action === 'lightning') {
      this.combat({ type: 'lightning', sourceId: s.character.id, targetId: target.character.id,
        position: { ...target.character.position }, damage: target.identity.isAdmin ? 0 : target.character.hp,
        at: Date.now() });
      if (!target.identity.isAdmin) {
        target.character.hp = 0;
        target.respawnAt = Date.now() + 2500;
        target.socket.emit('character', own(target));
      }
      return `Thiên phạt đã giáng xuống ${target.character.name}.`;
    }
    throw new Error('Hành động quản trị không được hỗ trợ.');
  }

  private combat(event: CombatEvent, only?: Socket): void {
    if (only) { only.emit('combat', event); return; }
    for (const player of this.players.values()) {
      if (player.character.scene === 'overworld') player.socket.emit('combat', event);
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
        s.character.position = { x: 0, y: 0, z: 10 };
        s.socket.emit('character', own(s));
        s.socket.emit('notice', 'Thần hồn quy vị. Bạn đã hồi sinh tại Vân Thượng.' );
      }
      if (now - s.lastInputAt <= 400 && (s.character.hp > 0 || s.identity.isAdmin)) {
        const speed = s.identity.isAdmin ? 30 : 6;
        const previous = { ...s.character.position };
        s.character.position.x += s.input.x * speed * dt;
        s.character.position.z += s.input.z * speed * dt;
        clampToWorld(s.character.position, s.trial ? TRIAL_RADIUS : WORLD_RADIUS);
        if (!s.trial) {
          const obstacles = [
            ...(this.boss.hp > 0 ? [{ position: this.boss.position, radius: 2.7 }] : []),
            { position: { x: 0, y: 0, z: -35 }, radius: 4.2 },
            { position: { x: -30, y: 0, z: -29 }, radius: 2.5 },
            { position: { x: 30, y: 0, z: -28 }, radius: 2.5 },
            ...[...this.players.values()].filter((p) => p !== s && p.character.scene === 'overworld')
              .map((p) => ({ position: p.character.position, radius: 1.05 })),
          ];
          // An already-overlapping spawn is allowed to walk OUT, not further in.
          if (obstacles.some((obstacle) => {
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
      this.io.emit('notice', 'Huyền Thiên Cổ Long đã thức tỉnh lần nữa!');
    }
    if (this.boss.hp > 0 && now >= this.bossAttackAt) {
      this.bossAttackAt = now + 8000;
      for (const s of this.players.values()) {
        if (s.character.scene !== 'overworld' || s.character.hp <= 0 || distanceXZ(s.character.position, this.boss.position) > 11) continue;
        const inFormation = [...this.formations.values()].some((formation) => distanceXZ(s.character.position, formation.position) <= formation.radius);
        const base = Math.max(3, 27 - Math.floor(equippedStats(s.character).defense * 0.6));
        const damage = s.identity.isAdmin ? 0 : Math.max(1, Math.round(base * (inFormation ? 0.8 : 1) * (s.shieldUntil > now ? 0.25 : 1)));
        if (damage) s.character.hp = Math.max(0, s.character.hp - damage);
        this.combat({ type: 'boss-hit', sourceId: this.boss.id, targetId: s.character.id,
          position: { ...s.character.position }, damage, at: now });
        s.socket.emit('character', own(s));
        if (s.character.hp === 0) s.respawnAt = now + 3000;
      }
    }
    for (const [id, drop] of this.drops) if (drop.expiresAt <= now) this.drops.delete(id);
    for (const [id, formation] of this.formations) if (formation.expiresAt <= now) this.formations.delete(id);
    if (now >= this.nextSnapshotAt) { this.nextSnapshotAt = now + 100; this.sendSnapshots(); }
    if (now >= this.nextCharacterAt) {
      this.nextCharacterAt = now + 1000;
      for (const s of this.players.values()) {
        if (s.character.scene === 'overworld' && [...this.formations.values()].some((formation) => distanceXZ(s.character.position, formation.position) <= formation.radius)) {
          s.character.mp = Math.min(s.character.maxMp, s.character.mp + 2);
        }
        s.socket.emit('character', own(s));
      }
    }
    if (now >= this.nextRosterAt) { this.nextRosterAt = now + 1000; this.sendAdminRoster(); }
    if (now >= this.nextPersistAt && !this.saving) {
      this.nextPersistAt = now + 10_000;
      void this.persistAll();
    }
  }

  private sendSnapshots(): void {
    const overworld = [...this.players.values()].filter((p) => p.character.scene === 'overworld').map(publicPlayer);
    const trial = [...this.players.values()].filter((p) => p.character.scene === 'tribulation');
    const normal: WorldSnapshot = { players: overworld, boss: { ...this.boss }, drops: [...this.drops.values()], formations: [...this.formations.values()], at: Date.now() };
    for (const player of this.players.values()) {
      if (player.character.scene === 'overworld') player.socket.emit('world', normal);
    }
    for (const player of trial) {
      player.socket.emit('world', { players: [publicPlayer(player)], boss: { ...this.boss, hp: 0 }, drops: [], formations: [], at: Date.now() } satisfies WorldSnapshot);
    }
  }

  private sendAdminRoster(): void {
    const roster = [...this.players.values()].map((p) => ({
      id: p.character.id, name: p.character.name, position: { ...p.character.position },
      realm: p.character.realm, scene: p.character.scene, hp: p.identity.isAdmin ? GOD_STAT : p.character.hp,
    }));
    for (const s of this.players.values()) if (s.identity.isAdmin) s.socket.emit('admin:players', roster);
  }

  private async persistAll(): Promise<void> {
    this.saving = true;
    try {
      await Promise.all([...this.players.values()].map(async (s) => {
        await this.store.save(s.character);
        await this.cache.update(s.character, s.identity.isAdmin);
      }));
    } catch (error) { console.error('[world] Periodic persistence failed:', error); }
    finally { this.saving = false; }
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    await this.persistAll();
  }
}
