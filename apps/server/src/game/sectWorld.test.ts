import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, expForStage, HERB_NODES, MAX_REALM, NPCS, type ActionResult, type OwnCharacter, type WorldSnapshot } from '@van-thuong/shared';
import { makeDemoSession, verifyIdentity, type Identity } from '../auth.js';
import { MemoryCache } from '../db/cache.js';
import { MemoryStore } from '../db/store.js';
import { newCharacter } from './rules.js';
import { vietnamDay } from './sect.js';
import { World } from './World.js';

function ack(socket: ClientSocket, event: string, payload: unknown = {}): Promise<ActionResult> {
  return new Promise((resolve, reject) => socket.timeout(4000).emit(event, payload,
    (error: Error | null, result: ActionResult) => error ? reject(error) : resolve(result)));
}
function nextEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timeout: ${event}`)); }, 5000);
    const listener = (result: T) => { clearTimeout(timeout); resolve(result); };
    socket.once(event, listener);
  });
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function server(store: MemoryStore, identity: (token: string) => Promise<Identity>) {
  const http = createServer();
  const io = new Server(http, { transports: ['websocket'] });
  const cache = new MemoryCache();
  const world = new World(io, store, cache);
  io.use(async (socket, next) => {
    try { socket.data.identity = await identity(socket.handshake.auth.token); next(); }
    catch { next(new Error('bad token')); }
  });
  io.on('connection', (socket) => { void world.join(socket, socket.data.identity as Identity); });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  return {
    world, url: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    close: async () => {
      await world.close();
      await new Promise<void>((resolve, reject) => io.close((error) => error ? reject(error) : resolve()));
      await cache.close(); await store.close();
    },
  };
}

describe('sect Socket.IO integration (server-owned progress and NPC transactions)', () => {
  it('exposes the same five daily quests over API and socket; validates distance, rewards, shop, equipment, hotbar and pills', async () => {
    const store = new MemoryStore();
    const quest = makeDemoSession(), shopper = makeDemoSession();
    const a = newCharacter(quest.identity.uid, { name: 'Sách Nhiệm Vụ', gender: 'nu', appearance: DEFAULT_APPEARANCE });
    a.position = { ...NPCS.quest.position };
    a.dailyDay = vietnamDay();
    a.dailyQuests = ['gather_herbs', 'courier_master', 'courier_shop', 'kill_wolves', 'meditation'].map((id) =>
      ({ id: id as typeof a.dailyQuests[number]['id'], progress: id === 'gather_herbs' ? 10 : 0, claimed: false }));
    const b = newCharacter(shopper.identity.uid, { name: 'Khách Mua', gender: 'nam', appearance: DEFAULT_APPEARANCE });
    b.position = { ...NPCS.shop.position }; b.hp = 30;
    b.resources.stones = 200; b.contribution = 100;
    b.realm = 2; b.minorStage = 9; b.cultivation = expForStage(9); b.path = 'kiem';
    await store.create(a); await store.create(b);
    const host = await server(store, async (token) => verifyIdentity(token));
    const alice = clientIo(host.url, { transports: ['websocket'], auth: { token: quest.token, isAdmin: true } });
    const bob = clientIo(host.url, { transports: ['websocket'], auth: { token: shopper.token } });
    try {
      const [me, buyer] = await Promise.all([nextEvent<OwnCharacter>(alice, 'character'), nextEvent<OwnCharacter>(bob, 'character')]);
      expect(me.dailyQuests).toHaveLength(5);
      const daily = await host.world.dailyQuests(quest.identity.uid);
      expect(daily?.day).toBe(vietnamDay());
      expect(daily?.quests).toEqual(me.dailyQuests);
      expect((await ack(alice, 'shop:buy', { offerId: 'moon_robe', position: NPCS.shop.position })).ok).toBe(false);
      expect((await ack(bob, 'quest:claim', { questId: 'gather_herbs', progress: 9999 })).ok).toBe(false);
      expect((await ack(bob, 'gather', { nodeId: HERB_NODES[0].id, position: HERB_NODES[0].position })).ok).toBe(false);
      expect((await ack(alice, 'basic-attack', { damage: 99999 })).ok).toBe(false); // safe zone
      expect((await ack(alice, 'quest:claim', { questId: 'kill_wolves', progress: 9999 })).ok).toBe(false);
      const claimed = await ack(alice, 'quest:claim', { questId: 'gather_herbs', reward: { contribution: 999999 } });
      expect(claimed.ok).toBe(true);
      if (claimed.ok) {
        expect(claimed.character?.contribution).toBe(25);
        expect(claimed.character?.cultivation).toBe(a.cultivation + 100);
      }
      expect((await ack(alice, 'quest:claim', { questId: 'gather_herbs' })).ok).toBe(false);
      expect((await host.world.dailyQuests(quest.identity.uid))?.quests.find((q) => q.id === 'gather_herbs')?.claimed).toBe(true);
      expect((await store.get(quest.identity.uid))?.contribution).toBe(25);

      const robe = await ack(bob, 'shop:buy', { offerId: 'moon_robe', price: 0, itemId: 'immortal_sword' });
      expect(robe.ok).toBe(true);
      const item = robe.ok && robe.character?.inventory.find((owned) => owned.itemId === 'moon_robe');
      expect(item).toBeTruthy();
      expect((await ack(bob, 'equip', { instanceId: item && item.instanceId })).ok).toBe(true);
      const heal = await ack(bob, 'shop:buy', { offerId: 'heal_pill' });
      const pill = heal.ok && heal.character?.inventory.find((owned) => owned.itemId === 'heal_pill');
      expect(pill).toBeTruthy();
      const used = await ack(bob, 'use-item', { instanceId: pill && pill.instanceId, hp: 99999 });
      expect(used.ok).toBe(true);
      if (used.ok) expect([used.character?.hp, used.character?.inventory.some((entry) => entry.itemId === 'heal_pill')]).toEqual([100, false]);
      expect((await ack(bob, 'assign-hotbar', { slot: 2, skillId: 'void_meteor' })).ok).toBe(false);
      expect((await ack(bob, 'shop:buy', { offerId: 'sword_book' })).ok).toBe(true);
      expect((await ack(bob, 'assign-hotbar', { slot: 2, skillId: 'sword_domain' })).ok).toBe(true);
      expect((await ack(bob, 'assign-hotbar', { slot: 3, skillId: 'sword_domain' })).ok).toBe(false);
      const foundation = await ack(bob, 'shop:buy', { offerId: 'foundation_pill' });
      expect(foundation.ok).toBe(true);
      const trial = await ack(bob, 'breakthrough', { usePill: true, realm: MAX_REALM, success: true });
      expect(trial.ok).toBe(true);
      if (trial.ok) {
        expect(trial.character?.scene).toBe('tribulation');
        expect(trial.character?.inventory.some((owned) => owned.itemId === 'foundation_pill')).toBe(false);
      }
      expect((await ack(bob, 'breakthrough', { usePill: true })).ok).toBe(false);
      bob.disconnect(); await sleep(140);
      expect((await store.get(shopper.identity.uid))?.scene).toBe('overworld');
      expect((await store.get(shopper.identity.uid))?.realm).toBe(2); // no free realm on disconnect
      expect((await store.get(shopper.identity.uid))?.equipment.robe).toBe(item && item.instanceId);
      expect(buyer.isAdmin).toBe(false);
    } finally { alice.disconnect(); bob.disconnect(); await host.close(); }
  }, 12_000);

  it('requires BOTH verified admin identity and database role for /devmode; persists and revokes on role removal', async () => {
    class RoleStore extends MemoryStore { role = false; override async hasAdminRole() { return this.role; } }
    const store = new RoleStore();
    const identity: Identity = { uid: 'verified-admin-fixture', displayName: 'Chủ Tông Môn', provider: 'password', isAdmin: true };
    const c = newCharacter(identity.uid, { name: 'daniel965', gender: 'nam', appearance: DEFAULT_APPEARANCE });
    c.scene = 'wilderness'; c.position = { x: 0, y: 0, z: -29 }; c.rotation = Math.PI;
    c.resources = { stones: 0, herbs: 0, ore: 0, ink: 0 };
    await store.create(c);
    // This middleware simulates a successfully verified custom-claim+UID identity; the DB role is still separate.
    const host = await server(store, async (token) => {
      if (token !== 'verified-token-fixture') throw new Error('unverified');
      return identity;
    });
    let admin = clientIo(host.url, { transports: ['websocket'], auth: { token: 'verified-token-fixture', role: 'admin' } });
    try {
      await nextEvent<OwnCharacter>(admin, 'character');
      const denied = await ack(admin, 'chat', '/devmode');
      expect(denied.ok).toBe(false);
      expect((await store.get(identity.uid))?.devMode).toBe(false);
      expect((await ack(admin, 'admin:action', { type: 'spawn-item', itemId: 'immortal_sword' })).ok).toBe(false);
      store.role = true;
      admin.disconnect(); await sleep(110);
      admin = clientIo(host.url, { transports: ['websocket'], auth: { token: 'verified-token-fixture' } });
      expect((await nextEvent<OwnCharacter>(admin, 'character')).isAdmin).toBe(true);
      const enabled = await ack(admin, 'chat', '/devmode');
      expect(enabled.ok).toBe(true);
      if (enabled.ok) expect([enabled.character?.realm, enabled.character?.minorStage, enabled.character?.root.tier,
        enabled.character?.hp, enabled.character?.maxMp]).toEqual([MAX_REALM, 9, 'hon_don', 999_999_999, 999_999_999]);
      expect((await store.get(identity.uid))?.devModeBackup?.realm).toBe(0);
      expect(enabled.ok && enabled.character?.resources.stones).toBe(999_999_999);
      expect((await ack(admin, 'craft', { recipeId: 'fate_orb' })).ok).toBe(true);
      expect((await store.get(identity.uid))?.resources.stones).toBe(0);
      const kill = await ack(admin, 'basic-attack', { targetId: 'world-boss', damage: 1 });
      expect(kill.ok).toBe(true);
      const snapshot = await nextEvent<WorldSnapshot>(admin, 'world');
      expect(snapshot.boss!.hp).toBe(0); // server hitbox, one shot, no client damage trust
      expect((await ack(admin, 'basic-attack')).ok).toBe(true); // no cooldown
      store.role = false;
      expect((await ack(admin, 'admin:action', { type: 'spawn-item', itemId: 'immortal_sword' })).ok).toBe(false);
      admin.disconnect(); await sleep(110);
      admin = clientIo(host.url, { transports: ['websocket'], auth: { token: 'verified-token-fixture' } });
      const demoted = await nextEvent<OwnCharacter>(admin, 'character');
      expect([demoted.devMode, demoted.realm, demoted.root.tier, demoted.maxHp]).toEqual([false, 0, c.root.tier, 120]);
      expect((await store.get(identity.uid))?.devMode).toBe(false);
      expect((await store.get(identity.uid))?.resources).toEqual({ stones: 0, herbs: 0, ore: 0, ink: 0 });
      expect((await store.get(identity.uid))?.devModeBackup).toBeUndefined();
    } finally { admin.disconnect(); await host.close(); }
  }, 12_000);
});
