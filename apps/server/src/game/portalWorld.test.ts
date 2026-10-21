import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, HABITATS, HERB_NODES, NPCS, PORTALS, SECT_BUILDINGS,
  type ActionResult, type CharacterState, type OwnCharacter, type WorldSnapshot } from '@van-thuong/shared';
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
  return new Promise((resolve) => socket.once(event, resolve));
}
function worldWhere(socket: ClientSocket, match: (state: WorldSnapshot) => boolean): Promise<WorldSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('world', listener); reject(new Error('Timed out waiting for world snapshot')); }, 4000);
    const listener = (state: WorldSnapshot) => {
      if (!match(state)) return;
      clearTimeout(timer); socket.off('world', listener); resolve(state);
    };
    socket.on('world', listener);
  });
}

async function host(store: MemoryStore, identify: (token: string) => Promise<Identity>) {
  const http = createServer();
  const io = new Server(http, { transports: ['websocket'] });
  const cache = new MemoryCache();
  const world = new World(io, store, cache);
  io.use(async (socket, done) => {
    try { socket.data.identity = await identify(socket.handshake.auth.token); done(); }
    catch { done(new Error('invalid identity')); }
  });
  io.on('connection', (socket) => { void world.join(socket, socket.data.identity as Identity); });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    close: async () => {
      await world.close();
      await new Promise<void>((resolve, reject) => io.close((error) => error ? reject(error) : resolve()));
      await cache.close(); await store.close();
    },
  };
}
const make = (uid: string, name: string) => newCharacter(uid, { name, gender: 'nu', appearance: DEFAULT_APPEARANCE });
async function walk(socket: ClientSocket, z: number, ms: number): Promise<void> {
  const send = () => socket.emit('input', { x: 0, z, rotation: z > 0 ? 0 : Math.PI });
  send();
  const interval = setInterval(send, 70);
  await new Promise((resolve) => setTimeout(resolve, ms));
  clearInterval(interval);
  socket.emit('input', { x: 0, z: 0, rotation: z > 0 ? 0 : Math.PI });
}

describe('sect ↔ wilderness portal instances', () => {
  it('ignores forged destinations, requires proximity, and isolates NPCs, gathering, players and encounters', async () => {
    const sessions = Array.from({ length: 4 }, () => makeDemoSession());
    const store = new MemoryStore();
    const [traveler, farAway, wrongNpc, wrongHerb] = sessions.map((session, i) => make(session.identity.uid, `Đệ Tử ${i + 1}`));
    traveler.position = { x: 0, y: 0, z: 5 };
    farAway.position = { x: 0, y: 0, z: 10 };
    wrongNpc.scene = 'wilderness'; wrongNpc.position = { ...NPCS.quest.position };
    wrongHerb.position = { ...HERB_NODES[0].position }; // same coordinates as a herb, wrong instance
    for (const c of [traveler, farAway, wrongNpc, wrongHerb]) await store.create(c);
    const server = await host(store, verifyIdentity);
    const sockets = sessions.map(({ token }) => clientIo(server.url, { transports: ['websocket'], auth: { token } }));
    const [a, b, c, d] = sockets;
    try {
      await Promise.all(sockets.map((socket) => next<OwnCharacter>(socket, 'character')));
      const sect = await worldWhere(a, (state) => state.scene === 'overworld' && state.players.length === 3);
      const wild = await worldWhere(c, (state) => state.scene === 'wilderness' && state.players.length === 1);
      expect([sect.boss, sect.monsters, sect.herbs, sect.players.some((p) => p.id === wrongNpc.id)])
        .toEqual([null, [], [], false]);
      expect([wild.boss?.hp, wild.monsters.length, wild.herbs.length, wild.players[0].id])
        .toEqual([850, HABITATS.filter((habitat) => habitat.scene === 'wilderness').length * 3, HERB_NODES.length, wrongNpc.id]);
      expect((await ack(b, 'portal:travel', { position: PORTALS.overworld.position, destination: 'wilderness' })).ok).toBe(false);
      expect((await ack(c, 'quest:claim', { questId: 'gather_herbs', position: NPCS.quest.position })).ok).toBe(false);
      expect((await ack(d, 'gather', { nodeId: HERB_NODES[0].id, position: HERB_NODES[0].position })).ok).toBe(false);
      expect((await ack(d, 'basic-attack', { damage: 999999 })).ok).toBe(false);

      const arrival = await ack(a, 'portal:travel', { destination: 'overworld', position: { x: 800, y: 0, z: 800 } });
      expect(arrival.ok).toBe(true);
      if (arrival.ok) {
        expect(arrival.character?.scene).toBe('wilderness');
        expect(arrival.character?.position).toEqual(PORTALS.overworld.arrival);
      }
      expect((await ack(a, 'portal:travel', { destination: 'overworld' })).ok).toBe(false); // arrival pad is not the return gate
      const after = await worldWhere(a, (state) => state.scene === 'wilderness' && state.players.length === 2);
      expect(after.players.map((p) => p.id).sort()).toEqual([traveler.id, wrongNpc.id].sort());
      const stayed = await worldWhere(b, (state) => state.scene === 'overworld' && state.players.length === 2);
      expect(stayed.players.some((p) => p.id === traveler.id)).toBe(false);
      expect((await store.get(traveler.ownerUid))?.scene).toBe('wilderness');
    } finally { sockets.forEach((socket) => socket.disconnect()); await server.close(); }
  }, 12_000);

  it('returns through the other gate, persists both zones, and never re-migrates version 2 saves', async () => {
    const sessions = Array.from({ length: 3 }, () => makeDemoSession());
    const store = new MemoryStore();
    const returning = make(sessions[0].identity.uid, 'Lữ Khách');
    returning.scene = 'wilderness'; returning.position = { x: 0, y: 0, z: 31 };
    const legacy = make(sessions[1].identity.uid, 'Cựu Đệ Tử');
    legacy.scene = 'overworld'; legacy.worldVersion = 1; legacy.position = { x: -12, y: 0, z: -11 };
    const southOfGate = make(sessions[2].identity.uid, 'Môn Sinh');
    southOfGate.position = { x: 0, y: 0, z: 1 }; // valid sect position on the new map
    for (const c of [returning, legacy, southOfGate]) await store.create(c);
    const server = await host(store, verifyIdentity);
    let a = clientIo(server.url, { transports: ['websocket'], auth: { token: sessions[0].token } });
    let b = clientIo(server.url, { transports: ['websocket'], auth: { token: sessions[1].token } });
    let c = clientIo(server.url, { transports: ['websocket'], auth: { token: sessions[2].token } });
    try {
      const [first, migrated, fresh] = await Promise.all([next<OwnCharacter>(a, 'character'), next<OwnCharacter>(b, 'character'), next<OwnCharacter>(c, 'character')]);
      expect([first.scene, migrated.scene, migrated.worldVersion, fresh.scene]).toEqual(['wilderness', 'wilderness', 2, 'overworld']);
      const home = await ack(a, 'portal:travel', { destination: 'wilderness', position: { x: -44, y: 0, z: -44 } });
      expect(home.ok).toBe(true);
      if (home.ok) expect([home.character?.scene, home.character?.position]).toEqual(['overworld', PORTALS.wilderness.arrival]);
      expect((await ack(a, 'portal:travel')).ok).toBe(false); // home arrival is not the outbound gate
      expect((await store.get(returning.ownerUid))?.scene).toBe('overworld');
      expect((await store.get(legacy.ownerUid))?.position).toEqual(legacy.position);
      b.disconnect(); c.disconnect();
      b = clientIo(server.url, { transports: ['websocket'], auth: { token: sessions[1].token } });
      c = clientIo(server.url, { transports: ['websocket'], auth: { token: sessions[2].token } });
      const [rejoinedOld, rejoinedNew] = await Promise.all([next<OwnCharacter>(b, 'character'), next<OwnCharacter>(c, 'character')]);
      expect([rejoinedOld.scene, rejoinedOld.worldVersion, rejoinedNew.scene, rejoinedNew.position.z])
        .toEqual(['wilderness', 2, 'overworld', 1]);
    } finally { a.disconnect(); b.disconnect(); c.disconnect(); await server.close(); }
  }, 12_000);

  it('lets players enter and exit the main hall through its visible doorway, not through its walls', async () => {
    const room = SECT_BUILDINGS[0];
    const session = makeDemoSession(), blockedSession = makeDemoSession();
    const store = new MemoryStore();
    const walking = make(session.identity.uid, 'Đạo Hữu');
    walking.position = { x: room.x, y: 0, z: room.z - room.depth / 2 - 2 };
    const blocked = make(blockedSession.identity.uid, 'Ngoài Tường');
    blocked.position = { x: room.x + room.doorway / 2 + 2, y: 0, z: walking.position.z };
    await store.create(walking); await store.create(blocked);
    const server = await host(store, verifyIdentity);
    const a = clientIo(server.url, { transports: ['websocket'], auth: { token: session.token } });
    const b = clientIo(server.url, { transports: ['websocket'], auth: { token: blockedSession.token } });
    try {
      await Promise.all([next<OwnCharacter>(a, 'character'), next<OwnCharacter>(b, 'character')]);
      await Promise.all([walk(a, 1, 1250), walk(b, 1, 1250)]);
      const entered = await worldWhere(a, (state) => (state.players.find((p) => p.id === walking.id)?.position.z ?? 0) > room.z - 2);
      const atDoor = entered.players.find((p) => p.id === walking.id)?.position.z ?? 0;
      const atWall = entered.players.find((p) => p.id === blocked.id)?.position.z ?? 0;
      expect(atDoor).toBeGreaterThan(room.z - room.depth / 2 + 2);
      expect(atWall).toBeLessThan(room.z - room.depth / 2 - 0.5);
      const story = await ack(a, 'sect:story');
      expect(story.ok).toBe(true); // the NPC inside is reachable, not sealed behind a façade
      await walk(a, -1, 1400);
      await worldWhere(a, (state) => (state.players.find((p) => p.id === walking.id)?.position.z ?? 99) < room.z - room.depth / 2 - 1);
      expect((await ack(a, 'sect:story')).ok).toBe(false);
    } finally { a.disconnect(); b.disconnect(); await server.close(); }
  }, 12_000);

  it('prevents claiming drops from the other map at the exact same coordinates', async () => {
    class RoleStore extends MemoryStore { override async hasAdminRole(uid: string) { return uid === 'zone-admin-fixture'; } }
    const admin: Identity = { uid: 'zone-admin-fixture', displayName: 'World operator', provider: 'password', isAdmin: true };
    const session = makeDemoSession();
    const store = new RoleStore();
    const conjurer = make(admin.uid, 'Thủ Môn');
    conjurer.scene = 'wilderness'; conjurer.position = { x: 0, y: 0, z: 33 }; conjurer.rotation = Math.PI;
    const sectPlayer = make(session.identity.uid, 'Người Qua Đường');
    sectPlayer.position = { x: 0, y: 0, z: 30 }; // where the admin will drop the item, but a different scene
    await store.create(conjurer); await store.create(sectPlayer);
    const server = await host(store, (token) => token === 'verified-zone-admin' ? Promise.resolve(admin) : verifyIdentity(token));
    const a = clientIo(server.url, { transports: ['websocket'], auth: { token: 'verified-zone-admin' } });
    const b = clientIo(server.url, { transports: ['websocket'], auth: { token: session.token } });
    try {
      await Promise.all([next<OwnCharacter>(a, 'character'), next<OwnCharacter>(b, 'character')]);
      const created = await ack(a, 'admin:action', { type: 'spawn-item', itemId: 'jade_blade', scene: 'overworld' });
      expect(created.ok).toBe(true);
      const wild = await worldWhere(a, (state) => state.drops.length === 1);
      const sect = await worldWhere(b, (state) => state.scene === 'overworld');
      expect(sect.drops).toHaveLength(0);
      expect(wild.drops[0].scene).toBe('wilderness');
      expect(Math.hypot(wild.drops[0].position.x - sectPlayer.position.x,
        wild.drops[0].position.z - sectPlayer.position.z)).toBeLessThan(0.001);
      expect((await ack(b, 'pickup', { dropId: wild.drops[0].id, position: sectPlayer.position })).ok).toBe(false);
      const picked = await ack(a, 'pickup', { dropId: wild.drops[0].id });
      expect(picked.ok).toBe(true);
      if (picked.ok) expect(picked.character?.inventory.some((item) => item.itemId === 'jade_blade')).toBe(true);
    } finally { a.disconnect(); b.disconnect(); await server.close(); }
  }, 12_000);
});
