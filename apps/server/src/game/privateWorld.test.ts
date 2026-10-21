import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { ASCENDANT_HERBS, ASCENDANT_GATE, DEFAULT_APPEARANCE, HOME_CHEST, HOME_GATE, MAX_REALM,
  REBIRTH_ALTAR, SECRET_GATE, type ActionResult, type OwnCharacter, type WorldSnapshot } from '@van-thuong/shared';
import { makeDemoSession, verifyIdentity, type Identity } from '../auth.js';
import { MemoryCache } from '../db/cache.js';
import { MemoryStore } from '../db/store.js';
import { addItem, newCharacter } from './rules.js';
import { World } from './World.js';

function ack(socket: ClientSocket, event: string, payload: object = {}): Promise<ActionResult> {
  return new Promise((resolve, reject) => socket.timeout(4000).emit(event, payload,
    (error: Error | null, result: ActionResult) => error ? reject(error) : resolve(result)));
}
function next<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}
function snapshot(socket: ClientSocket, scene: WorldSnapshot['scene']): Promise<WorldSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('world', listener); reject(new Error(`No ${scene} snapshot`)); }, 3000);
    const listener = (state: WorldSnapshot) => {
      if (state.scene !== scene) return;
      clearTimeout(timer); socket.off('world', listener); resolve(state);
    };
    socket.on('world', listener);
  });
}
async function host(store: MemoryStore) {
  const http = createServer();
  const io = new Server(http, { transports: ['websocket'] });
  const cache = new MemoryCache();
  const world = new World(io, store, cache);
  io.use(async (socket, done) => {
    try { socket.data.identity = await verifyIdentity(socket.handshake.auth.token); done(); }
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
const make = (uid: string) => newCharacter(uid, { name: 'Đệ Tử', gender: 'nu', appearance: DEFAULT_APPEARANCE });

/** Real sockets exercise UID-bound persistence and the per-player snapshot boundary. */
describe('server-owned homes, hidden chamber and Ascendant world', () => {
  it('isolates two houses even at identical coordinates and never transfers another UID’s item', async () => {
    const sessions = Array.from({ length: 3 }, () => makeDemoSession());
    const store = new MemoryStore();
    const [first, second, guest] = sessions.map(({ identity }) => make(identity.uid));
    first.scene = 'residence'; first.position = { ...HOME_CHEST.position };
    second.scene = 'residence'; second.position = { ...HOME_CHEST.position };
    guest.position = { ...HOME_GATE.position };
    const orb = addItem(first, 'fate_orb');
    for (const c of [first, second, guest]) await store.create(c);
    const server = await host(store);
    const [a, b, g] = sessions.map(({ token }) => clientIo(server.url, { transports: ['websocket'], auth: { token } }));
    try {
      await Promise.all([a, b, g].map((socket) => next<OwnCharacter>(socket, 'character')));
      const [homeA, homeB, sect] = await Promise.all([snapshot(a, 'residence'), snapshot(b, 'residence'), snapshot(g, 'overworld')]);
      expect(homeA.players.map((p) => p.id)).toEqual([first.id]);
      expect(homeB.players.map((p) => p.id)).toEqual([second.id]);
      expect(sect.players.map((p) => p.id)).toEqual([guest.id]);
      expect((await ack(b, 'home:transfer', { direction: 'deposit', instanceId: orb, ownerUid: first.ownerUid })).ok).toBe(false);
      expect((await ack(g, 'home:transfer', { direction: 'withdraw', instanceId: orb, ownerUid: first.ownerUid })).ok).toBe(false);
      expect((await ack(a, 'home:transfer', { direction: 'deposit', instanceId: first.equipment.weapon })).ok).toBe(false);
      const stored = await ack(a, 'home:transfer', { direction: 'deposit', instanceId: orb });
      expect(stored.ok).toBe(true);
      if (stored.ok) expect([stored.character?.stash.length, stored.character?.inventory.some((item) => item.instanceId === orb)]).toEqual([1, false]);
      expect((await ack(a, 'home:transfer', { direction: 'deposit', instanceId: orb })).ok).toBe(false);
      expect((await ack(b, 'home:transfer', { direction: 'withdraw', instanceId: orb })).ok).toBe(false);
      expect((await store.get(first.ownerUid))?.stash.map((item) => item.instanceId)).toEqual([orb]);
      expect((await store.get(second.ownerUid))?.stash).toEqual([]);
      expect((await ack(g, 'home:enter', { ownerUid: first.ownerUid, destination: 'residence' })).ok).toBe(true);
      expect((await snapshot(g, 'residence')).players.map((p) => p.id)).toEqual([guest.id]);
      expect((await ack(g, 'home:exit')).ok).toBe(true);
      a.disconnect();
      const rejoined = clientIo(server.url, { transports: ['websocket'], auth: { token: sessions[0].token } });
      try {
        const character = await next<OwnCharacter>(rejoined, 'character');
        expect([character.scene, character.stash.map((item) => item.instanceId)]).toEqual(['residence', [orb]]);
        const withdrawn = await ack(rejoined, 'home:transfer', { direction: 'withdraw', instanceId: orb });
        expect(withdrawn.ok).toBe(true);
        if (withdrawn.ok) expect(withdrawn.character?.inventory.filter((item) => item.instanceId === orb)).toHaveLength(1);
      } finally { rejoined.disconnect(); }
    } finally { a.disconnect(); b.disconnect(); g.disconnect(); await server.close(); }
  }, 9_000);

  it('locks the chamber at top realm, permits one rebirth, and gates the richer world by server state', async () => {
    const sessions = Array.from({ length: 3 }, () => makeDemoSession());
    const store = new MemoryStore();
    const [top, low, impossible] = sessions.map(({ identity }) => make(identity.uid));
    top.realm = MAX_REALM; top.minorStage = 9; top.highestRealm = MAX_REALM;
    top.scene = 'sanctum'; top.position = { ...REBIRTH_ALTAR.position };
    low.position = { ...SECRET_GATE.position };
    impossible.scene = 'ascendant'; impossible.position = { ...ASCENDANT_GATE.arrival };
    for (const c of [top, low, impossible]) await store.create(c);
    const server = await host(store);
    const [a, b, c] = sessions.map(({ token }) => clientIo(server.url, { transports: ['websocket'], auth: { token } }));
    try {
      const [topView, lowView, invalidView] = await Promise.all([a, b, c].map((socket) => next<OwnCharacter>(socket, 'character')));
      expect([topView.scene, lowView.scene, invalidView.scene]).toEqual(['sanctum', 'overworld', 'overworld']);
      expect((await ack(b, 'sanctum:enter', { realm: MAX_REALM, rebirths: 5 })).ok).toBe(false);
      expect((await ack(b, 'sanctum:ascend')).ok).toBe(false);
      expect((await ack(a, 'sanctum:ascend')).ok).toBe(false);
      const reborn = await ack(a, 'rebirth:choose', { rebirths: 25, realm: MAX_REALM });
      expect(reborn.ok).toBe(true);
      if (reborn.ok) expect([reborn.character?.realm, reborn.character?.rebirths, reborn.character?.highestRealm]).toEqual([0, 1, MAX_REALM]);
      expect((await ack(a, 'rebirth:choose')).ok).toBe(false);
      const send = () => a.emit('input', { x: 1, z: 0, rotation: Math.PI / 2 });
      send(); const timer = setInterval(send, 50);
      await new Promise((resolve) => setTimeout(resolve, 880));
      clearInterval(timer); a.emit('input', { x: 0, z: 0, rotation: Math.PI / 2 });
      const entry = await ack(a, 'sanctum:ascend', { destination: 'ascendant' });
      expect(entry.ok).toBe(true);
      if (entry.ok) expect([entry.character?.scene, entry.character?.position]).toEqual(['ascendant', ASCENDANT_GATE.arrival]);
      const upper = await snapshot(a, 'ascendant');
      expect(upper.players.map((p) => p.id)).toEqual([top.id]);
      expect([upper.boss, upper.monsters.length, upper.herbs.length]).toEqual([null, 5, ASCENDANT_HERBS.length]);
      expect((await snapshot(b, 'overworld')).players.some((p) => p.id === top.id)).toBe(false);
      expect((await ack(a, 'cast', { skillId: 'spirit_cut', targetId: 'wolf-1' })).ok).toBe(false);
      expect((await ack(a, 'gather', { nodeId: 'herb-1' })).ok).toBe(false);
      expect((await ack(b, 'gather', { nodeId: ASCENDANT_HERBS[0].id, position: ASCENDANT_HERBS[0].position })).ok).toBe(false);
      expect((await ack(a, 'portal:travel', { position: { x: 0, y: 0, z: 34 } })).ok).toBe(false);
      a.disconnect();
      const rejoined = clientIo(server.url, { transports: ['websocket'], auth: { token: sessions[0].token } });
      try {
        const character = await next<OwnCharacter>(rejoined, 'character');
        expect([character.scene, character.rebirths, character.highestRealm]).toEqual(['ascendant', 1, MAX_REALM]);
      } finally { rejoined.disconnect(); }
    } finally { a.disconnect(); b.disconnect(); c.disconnect(); await server.close(); }
  }, 9_000);
});
