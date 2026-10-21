import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, type ActionResult, type OwnCharacter, type TribulationState, type WorldSnapshot } from '@van-thuong/shared';
import { makeDemoSession, verifyIdentity, type Identity } from '../auth.js';
import { MemoryCache } from '../db/cache.js';
import { MemoryStore } from '../db/store.js';
import { newCharacter } from './rules.js';
import { World } from './World.js';

function ack(socket: ClientSocket, event: string, payload: object): Promise<ActionResult> {
  return new Promise((resolve, reject) => {
    socket.timeout(4000).emit(event, payload, (error: Error | null, result: ActionResult) => error ? reject(error) : resolve(result));
  });
}
function nextEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}
function sleep(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

// Real Socket.IO transport, real World tick, real demo auth. No browser or database needed.
describe('authoritative multiplayer world', () => {
  it('rejects forged admin privileges and positions, enforces hitboxes/cooldowns across reconnects, isolates tribulations', async () => {
    const http = createServer();
    const io = new Server(http, { transports: ['websocket'] });
    const store = new MemoryStore();
    const cache = new MemoryCache();
    const world = new World(io, store, cache);
    const first = makeDemoSession();
    const second = makeDemoSession();
    const charA = newCharacter(first.identity.uid, { name: 'Kiếm Khách', gender: 'nam', appearance: { ...DEFAULT_APPEARANCE, hair: 'tied', robeColor: 'jade' } });
    const charB = newCharacter(second.identity.uid, { name: 'Dược Sư', gender: 'nu', appearance: { ...DEFAULT_APPEARANCE, hairColor: 'silver' } });
    charA.scene = 'wilderness'; charA.position = { x: 0, y: 0, z: -29 };
    charA.rotation = Math.PI;
    charA.cultivation = 150;
    charA.resources.stones = 60;
    charA.resources.ink = 8;
    charB.scene = 'wilderness'; charB.position = { x: 5, y: 0, z: -26 };
    await store.create(charA);
    await store.create(charB);
    io.use(async (socket, next) => {
      try { socket.data.identity = await verifyIdentity(socket.handshake.auth.token); next(); }
      catch { next(new Error('bad token')); }
    });
    io.on('connection', (socket) => { void world.join(socket, socket.data.identity as Identity); });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    let a: ClientSocket | null = null;
    let b: ClientSocket | null = null;
    try {
      a = clientIo(url, { transports: ['websocket'], auth: { token: first.token, isAdmin: true, name: 'daniel965' } });
      b = clientIo(url, { transports: ['websocket'], auth: { token: second.token } });
      const [me, other] = await Promise.all([nextEvent<OwnCharacter>(a, 'character'), nextEvent<OwnCharacter>(b, 'character')]);
      expect(me.isAdmin).toBe(false);
      expect(other.isAdmin).toBe(false);
      expect((await verifyIdentity(first.token)).isAdmin).toBe(false);
      const forbidden = await ack(a, 'admin:action', { type: 'spawn-item', itemId: 'immortal_sword', isAdmin: true });
      expect(forbidden.ok).toBe(false);
      const appearanceBroadcast = nextEvent<WorldSnapshot>(b, 'world');
      const edited = await ack(a, 'appearance:update', { appearance: { ...charA.appearance, hair: 'bun', hairColor: 'gold', face: 'angular', height: 0.72, build: 0.64 }, isAdmin: true });
      expect(edited.ok).toBe(true);
      if (edited.ok) expect(edited.character?.appearance.face).toBe('angular');
      expect((await appearanceBroadcast).players.find(p => p.id === charA.id)?.appearance.hair).toBe('bun');
      const injected = await ack(b, 'appearance:update', { appearance: { ...charB.appearance, face: '__proto__', height: 999 } });
      expect(injected.ok).toBe(false);
      expect((await store.get(first.identity.uid))?.appearance.face).toBe('angular');
      expect((await store.get(second.identity.uid))?.appearance.face).toBe('oval');

      a.emit('input', { x: 999, z: 0, rotation: Math.PI, position: { x: 1000, y: 999, z: 1000 } });
      await sleep(180);
      const worldBefore = await nextEvent<WorldSnapshot>(a, 'world');
      expect(worldBefore.players.length).toBe(2);
      expect(worldBefore.players.find((p) => p.id === charA.id)?.position.x).toBe(0);
      a.emit('input', { x: 1, z: 0, rotation: Math.PI, position: { x: 1000, y: 999, z: 1000 } });
      await sleep(250);
      const moved = await nextEvent<WorldSnapshot>(a, 'world');
      expect(moved.players.find((p) => p.id === charA.id)?.position.x).toBeGreaterThan(0);
      expect(moved.players.find((p) => p.id === charA.id)?.position.x).toBeLessThan(3);
      a.emit('input', { x: 0, z: 0, rotation: Math.PI });

      expect((await ack(a, 'choose-path', { path: 'kiem', realm: 4 })).ok).toBe(false);
      const firstHit = await ack(a, 'cast', { skillId: 'spirit_cut', targetId: 'world-boss', damage: 999999999 });
      expect(firstHit.ok).toBe(true);
      const afterHit = await nextEvent<WorldSnapshot>(a, 'world');
      expect(afterHit.boss!.hp).toBeLessThan(afterHit.boss!.maxHp);
      expect(afterHit.boss!.hp).toBeGreaterThan(0);
      const spam = await ack(a, 'cast', { skillId: 'spirit_cut', targetId: 'world-boss', damage: 999999999 });
      expect(spam.ok).toBe(false);
      if (spam.ok === false) expect(spam.error).toContain('đang hồi');
      a.disconnect();
      await sleep(110);
      a = clientIo(url, { transports: ['websocket'], auth: { token: first.token } });
      await nextEvent<OwnCharacter>(a, 'character');
      const afterReconnect = await ack(a, 'cast', { skillId: 'spirit_cut', targetId: 'world-boss' });
      expect(afterReconnect.ok).toBe(false);
      if (afterReconnect.ok === false) expect(afterReconnect.error).toContain('đang hồi');
      const crafted = await ack(a, 'craft', { recipeId: 'fate_orb', free: true });
      expect(crafted.ok).toBe(true);
      const orb = crafted.ok ? crafted.character?.inventory.find((item) => item.itemId === 'fate_orb') : null;
      expect(orb?.instanceId).toBeTruthy();
      const equipped = await ack(a, 'equip', { instanceId: orb!.instanceId });
      expect(equipped.ok).toBe(true);
      const formation = await ack(a, 'place-array', { radius: 9000, position: { x: 999, y: 999, z: 999 } });
      expect(formation.ok).toBe(true);
      const worldWithFormation = await nextEvent<WorldSnapshot>(b, 'world');
      expect(worldWithFormation.formations).toHaveLength(1);
      expect(worldWithFormation.formations[0].radius).toBe(5);
      expect(worldWithFormation.formations[0].position.x).toBeLessThan(45);
      const trial = await ack(a, 'breakthrough', { realm: 4, success: true });
      expect(trial.ok).toBe(true);
      if (trial.ok) expect(trial.character?.scene).toBe('tribulation');
      const trialWorld = await nextEvent<WorldSnapshot>(a, 'world');
      expect(trialWorld.players).toHaveLength(1);
      expect(trialWorld.players[0].id).toBe(charA.id);
      expect(trialWorld.formations).toHaveLength(0);
      const guardEvent = nextEvent<TribulationState>(a, 'tribulation');
      const guard = await ack(a, 'guard', { invincible: true });
      expect(guard.ok).toBe(true);
      expect((await guardEvent).guarding).toBe(true);
      const thunder = await new Promise<TribulationState>((resolve, reject) => {
        const timeout = setTimeout(() => { a?.off('tribulation', listener); reject(new Error('No strike arrived')); }, 5000);
        const listener = (state: TribulationState) => { if (state.phase === 'strike') { clearTimeout(timeout); a?.off('tribulation', listener); resolve(state); } };
        a?.on('tribulation', listener);
      });
      expect(thunder.hits).toBe(0); // server-consumed artifact protected the first strike
      expect(thunder.guarding).toBe(false);
      a.disconnect();
      await sleep(130);
      expect((await store.get(first.identity.uid))?.scene).toBe('wilderness');
      expect((await store.get(first.identity.uid))?.realm).toBe(0); // no free advancement by disconnecting
    } finally {
      a?.disconnect(); b?.disconnect();
      await world.close();
      await new Promise<void>((resolve, reject) => io.close((error) => error ? reject(error) : resolve()));
      await cache.close(); await store.close();
    }
  }, 12_000);
});
