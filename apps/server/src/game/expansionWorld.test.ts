import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, HABITATS, NPCS, type ActionResult, type MonsterState, type OwnCharacter } from '@van-thuong/shared';
import { makeDemoSession, verifyIdentity, type Identity } from '../auth.js';
import { MemoryCache } from '../db/cache.js';
import { MemoryStore } from '../db/store.js';
import { newCharacter } from './rules.js';
import { MONSTER_SPAWNS, SPAWNS_PER_HABITAT, World } from './World.js';

function ack(socket: ClientSocket, event: string, payload: object = {}): Promise<ActionResult> {
  return new Promise((resolve, reject) => socket.timeout(4000).emit(event, payload,
    (error: Error | null, result: ActionResult) => error ? reject(error) : resolve(result)));
}
function next<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`No ${event}`)); }, 4000);
    const listener = (value: T) => { clearTimeout(timer); resolve(value); };
    socket.once(event, listener);
  });
}

describe('new habitats, spirit beasts and alchemy (authoritative server)', () => {
  it('spawns one pack of enemies in every spaced-out level habitat', () => {
    expect(HABITATS).toHaveLength(20);
    expect(MONSTER_SPAWNS).toHaveLength(20 * SPAWNS_PER_HABITAT);
    expect(new Set(HABITATS.map((habitat) => habitat.level)).size).toBe(14);
    expect(new Set(HABITATS.map((habitat) => habitat.biome)).size).toBeGreaterThanOrEqual(7);
    for (const habitat of HABITATS) {
      const spawned = MONSTER_SPAWNS.filter((monster) => monster.id.startsWith(`${habitat.id}-`));
      expect(spawned).toHaveLength(SPAWNS_PER_HABITAT);
      expect(spawned.every((monster) => monster.scene === habitat.scene && monster.kind === habitat.kind && monster.level === habitat.level &&
        Math.hypot(monster.position.x - habitat.center.x, monster.position.z - habitat.center.z) < habitat.radius)).toBe(true);
      for (const other of HABITATS) {
        if (other === habitat || habitat.scene !== other.scene) continue;
        expect(Math.hypot(habitat.center.x - other.center.x, habitat.center.z - other.center.z)).toBeGreaterThan(18);
      }
    }
  });

  it('only refines pills at the alchemist, never trusts forged taming HP/position, and grants a uniquely owned companion without kill rewards', async () => {
    const server = createServer();
    const io = new Server(server, { transports: ['websocket'] });
    const store = new MemoryStore();
    const cache = new MemoryCache();
    const world = new World(io, store, cache);
    const sessions = [makeDemoSession(), makeDemoSession()];
    const alchemist = newCharacter(sessions[0].identity.uid, { name: 'Luyện Đan Sư', gender: 'nu', appearance: DEFAULT_APPEARANCE });
    alchemist.position = { ...NPCS.alchemist.position };
    alchemist.resources = { stones: 24, herbs: 16, ore: 4, ink: 3 };
    const wolf = MONSTER_SPAWNS.find((monster) => monster.id === 'wolf-glen-1')!;
    const hunter = newCharacter(sessions[1].identity.uid, { name: 'Ngự Thú Sư', gender: 'nam', appearance: DEFAULT_APPEARANCE });
    hunter.scene = 'wilderness'; hunter.position = { ...wolf.position, z: wolf.position.z + 2.4 };
    hunter.realm = 2; hunter.minorStage = 1; hunter.path = 'thu'; hunter.rotation = Math.PI;
    // A pre-rebirth save can remember a high-level book; it still must not cast or rebind it at Trúc Cơ.
    hunter.learnedSkills.push('myriad_beasts'); hunter.hotbar[2] = 'myriad_beasts';
    await store.create(alchemist); await store.create(hunter);
    io.use(async (socket, done) => {
      try { socket.data.identity = await verifyIdentity(socket.handshake.auth.token); done(); }
      catch { done(new Error('Invalid session')); }
    });
    io.on('connection', (socket) => { void world.join(socket, socket.data.identity as Identity); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const a = clientIo(url, { transports: ['websocket'], auth: { token: sessions[0].token } });
    const b = clientIo(url, { transports: ['websocket'], auth: { token: sessions[1].token } });
    try {
      await Promise.all([next<OwnCharacter>(a, 'character'), next<OwnCharacter>(b, 'character')]);
      expect((await ack(b, 'choose-path', { path: 'ma' })).ok).toBe(false); // normal path is a one-time choice
      expect((await ack(b, 'appearance:update', { gender: 'nu', appearance: DEFAULT_APPEARANCE })).ok).toBe(false);
      expect((await ack(b, 'assign-hotbar', { slot: 3, skillId: 'myriad_beasts' })).ok).toBe(false);
      expect((await ack(b, 'cast', { skillId: 'myriad_beasts', realm: 11 })).ok).toBe(false);
      expect((await ack(b, 'craft', { recipeId: 'heal_pill', position: NPCS.alchemist.position })).ok).toBe(false);
      expect((await ack(a, 'craft', { recipeId: 'invalid', cost: {} })).ok).toBe(false);
      for (const recipeId of ['heal_pill', 'mana_pill', 'foundation_pill'])
        expect((await ack(a, 'craft', { recipeId, cost: {} })).ok).toBe(true);
      const pills = (await store.get(alchemist.ownerUid))!;
      expect(pills.resources).toEqual({ stones: 3, herbs: 1, ore: 2, ink: 3 });
      expect(pills.inventory.slice(2).map((owned) => owned.itemId)).toEqual(['heal_pill', 'mana_pill', 'foundation_pill']);
      expect(new Set(pills.inventory.map((owned) => owned.instanceId)).size).toBe(pills.inventory.length);
      expect((await ack(a, 'beast:tame', { targetId: wolf.id, scene: 'wilderness', position: wolf.position })).ok).toBe(false);
      const fake = await ack(b, 'beast:tame', { targetId: wolf.id, hp: 1, position: wolf.position });
      expect(fake.ok).toBe(false); // client damage and HP do not change the real beast
      // Fixture simulates real combat damage ON THE SERVER to deterministically check the threshold.
      const beast = (world as unknown as { monsters: Map<string, MonsterState> }).monsters.get(wolf.id)!;
      beast.hp = Math.floor(beast.maxHp * 0.35);
      beast.level = 8;
      expect((await ack(b, 'beast:tame', { targetId: wolf.id, level: 1 })).ok).toBe(false);
      beast.level = 1;
      const tamed = await ack(b, 'beast:tame', { targetId: wolf.id, itemId: 'immortal_sword', hp: 0 });
      expect(tamed.ok).toBe(true);
      const owner = (await store.get(hunter.ownerUid))!;
      const companion = owner.inventory.find((entry) => entry.itemId === 'spirit_wolf');
      expect(companion?.instanceId).toBeTruthy();
      expect(owner.equipment.pet).toBe(companion?.instanceId);
      expect(owner.resources).toEqual({ stones: 19, herbs: 3, ore: 4, ink: 3 });
      expect(owner.storyKills).toBe(0); // taming is not a killing blow
      expect(beast.hp).toBe(0);
      expect(beast.respawnAt).toBeGreaterThan(Date.now());
      expect((await ack(b, 'beast:tame', { targetId: wolf.id })).ok).toBe(false);
      expect(pills.inventory.some((entry) => entry.instanceId === companion?.instanceId)).toBe(false);
      expect((await ack(a, 'equip', { instanceId: companion?.instanceId })).ok).toBe(false);
    } finally {
      a.disconnect(); b.disconnect();
      await world.close();
      await new Promise<void>((resolve, reject) => io.close((error) => error ? reject(error) : resolve()));
      await cache.close(); await store.close();
    }
  }, 9000);
});
