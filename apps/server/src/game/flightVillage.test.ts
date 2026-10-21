import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, NPCS, PORTALS, SHOP_STOCK, VILLAGE_GATE, type ActionResult, type OwnCharacter, type WorldSnapshot } from '@van-thuong/shared';
import { makeDemoSession, verifyIdentity, type Identity } from '../auth.js';
import { MemoryCache } from '../db/cache.js';
import { MemoryStore } from '../db/store.js';
import { newCharacter } from './rules.js';
import { World } from './World.js';

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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Move an already-connected character the same way the movement tick would, without a long walk. */
function place(world: World, characterId: string, position: { x: number; y: number; z: number }) {
  const live = [...(world as unknown as { players: Map<string, { character: { position: typeof position } }> })
    .players.values()].find((entry) => (entry.character as { id?: string }).id === characterId);
  if (!live) throw new Error('player not live');
  live.character.position = { ...position };
}

function make(ownerUid: string, name: string) {
  return newCharacter(ownerUid, { name, gender: 'nam', appearance: DEFAULT_APPEARANCE });
}

describe('flight and the Vân Cốc village (authoritative server)', () => {
  it('only lifts off with an equipped, path-appropriate mount and drains chân khí while airborne', async () => {
    const sessions = [makeDemoSession(), makeDemoSession(), makeDemoSession(), makeDemoSession()];
    const store = new MemoryStore();
    const swordsman = make(sessions[0].identity.uid, 'Ngự Kiếm Sư');
    swordsman.scene = 'wilderness'; swordsman.position = { x: 0, y: 0, z: 30 };
    swordsman.realm = 2; swordsman.minorStage = 1; swordsman.path = 'kiem'; swordsman.rotation = Math.PI;
    swordsman.learnedSkills.push('flying_swords'); swordsman.hotbar[1] = 'flying_swords';
    swordsman.inventory.push({ instanceId: 'sword-mount', itemId: 'flying_sword', acquiredAt: Date.now() });
    swordsman.equipment.mount = 'sword-mount';
    swordsman.mp = 60;
    const mortal = make(sessions[1].identity.uid, 'Luyện Khí Sĩ');
    mortal.scene = 'wilderness'; mortal.position = { x: 4, y: 0, z: 30 }; mortal.rotation = Math.PI;
    mortal.inventory.push({ instanceId: 'mortal-sword', itemId: 'flying_sword', acquiredAt: Date.now() });
    mortal.equipment.mount = 'mortal-sword';
    const mage = make(sessions[2].identity.uid, 'Pháp Tu');
    mage.scene = 'wilderness'; mage.position = { x: 8, y: 0, z: 30 }; mage.rotation = Math.PI;
    mage.realm = 3; mage.minorStage = 1; mage.path = 'phap';
    mage.inventory.push({ instanceId: 'mage-sword', itemId: 'flying_sword', acquiredAt: Date.now() });
    mage.equipment.mount = 'mage-sword';
    const demon = make(sessions[3].identity.uid, 'Ma Tu');
    demon.scene = 'wilderness'; demon.position = { x: 12, y: 0, z: 30 }; demon.rotation = Math.PI;
    demon.realm = 3; demon.minorStage = 1; demon.path = 'ma';
    demon.inventory.push({ instanceId: 'demon-sword', itemId: 'flying_sword', acquiredAt: Date.now() });
    demon.equipment.mount = 'demon-sword';
    for (const character of [swordsman, mortal, mage, demon]) await store.create(character);

    const server = createServer();
    const io = new Server(server, { transports: ['websocket'] });
    const world = new World(io, store, new MemoryCache());
    io.use(async (socket, done) => {
      try { socket.data.identity = await verifyIdentity(socket.handshake.auth.token); done(); }
      catch { done(new Error('Invalid session')); }
    });
    io.on('connection', (socket) => { void world.join(socket, socket.data.identity as Identity); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const sockets = sessions.map(({ token }) => clientIo(url, { transports: ['websocket'], auth: { token } }));
    const [a, b, c, d] = sockets;
    try {
      const view = await Promise.all(sockets.map((socket) => next<OwnCharacter>(socket, 'character')));
      expect(view.map((character) => character.flying)).toEqual([false, false, false, false]);
      // Unarmed, under-realm and wrong-path riders are all rejected by the server, not the client.
      expect((await ack(b, 'flight:toggle')).ok).toBe(false);
      expect((await ack(c, 'flight:toggle')).ok).toBe(false);
      expect((await ack(a, 'flight:toggle')).ok).toBe(true);
      expect((await store.get(swordsman.ownerUid))?.flying).toBe(true);
      // A Tà tu may ride any flight treasure, including a sword.
      expect((await ack(d, 'flight:toggle')).ok).toBe(true);
      await sleep(1200);
      const airborne = (await store.get(swordsman.ownerUid))!;
      expect(airborne.flying).toBe(true);
      expect(airborne.mp).toBeLessThan(60); // chân khí is spent by the tick, not by the browser
      const landing = await ack(a, 'flight:toggle');
      expect(landing.ok).toBe(true);
      expect((await store.get(swordsman.ownerUid))?.flying).toBe(false);
      // Landing again is allowed from any air position.
      expect((await ack(d, 'flight:toggle')).ok).toBe(true);
      expect((await store.get(demon.ownerUid))?.flying).toBe(false);
    } finally { sockets.forEach((socket) => socket.disconnect()); await server.close(); }
  }, 12_000);

  it('keeps Vân Cốc a separate safe map with its own merchant, then returns players to the mountain path', async () => {
    const sessions = [makeDemoSession(), makeDemoSession()];
    const store = new MemoryStore();
    const villager = make(sessions[0].identity.uid, 'Lữ Khách');
    villager.position = { ...VILLAGE_GATE.position };
    villager.resources = { stones: 120, herbs: 0, ore: 0, ink: 0 };
    villager.contribution = 20;
    const outsider = make(sessions[1].identity.uid, 'Người Ngoài');
    outsider.position = { x: 0, y: 0, z: 20 };
    await store.create(villager); await store.create(outsider);

    const server = createServer();
    const io = new Server(server, { transports: ['websocket'] });
    const world = new World(io, store, new MemoryCache());
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
      expect((await ack(b, 'village:enter')).ok).toBe(false); // the gate is far away, so walking is required
      const snapshot = next<WorldSnapshot>(a, 'world');
      expect((await ack(a, 'village:enter')).ok).toBe(true);
      const entered = (await store.get(villager.ownerUid))!;
      expect([entered.scene, entered.position]).toEqual(['village', VILLAGE_GATE.arrival]);
      const village = await snapshot;
      expect([village.scene, village.monsters.length, village.herbs.length, village.drops.length, village.boss]).toEqual(['village', 0, 0, 0, null]);
      // The merchant is only reachable inside the village; the sect shop does not answer here.
      expect((await ack(a, 'shop:buy', { offerId: 'spirit_cloud' })).ok).toBe(false);
      place(world, villager.id, { ...NPCS.village_shop.position });
      expect((await ack(a, 'shop:buy', { offerId: 'spirit_cloud' })).ok).toBe(true);
      const shopper = (await store.get(villager.ownerUid))!;
      const cloud = shopper.inventory.find((item) => item.itemId === 'spirit_cloud');
      expect(cloud?.instanceId).toBeTruthy();
      expect(shopper.resources.stones).toBe(120 - SHOP_STOCK.find((offer) => offer.id === 'spirit_cloud')!.stones);
      // Safe village: combat and gathering are refused even with a valid skill equipped.
      expect((await ack(a, 'cast', { skillId: 'spirit_cut' })).ok).toBe(false);
      expect((await ack(a, 'gather', { nodeId: 'herb-1' })).ok).toBe(false);
      // The return gate puts the traveller back on the mountain path, not inside the sect.
      place(world, villager.id, { ...PORTALS.village.position });
      expect((await ack(a, 'portal:travel', { position: PORTALS.village.position })).ok).toBe(true);
      const home = (await store.get(villager.ownerUid))!;
      expect([home.scene, home.position]).toEqual(['overworld', PORTALS.village.arrival]);
      expect((await ack(a, 'village:exit')).ok).toBe(false); // already back on the mountain
    } finally { a.disconnect(); b.disconnect(); await server.close(); }
  }, 12_000);
});
