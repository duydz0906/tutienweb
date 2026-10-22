import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, INN_NPCS, NPCS, innRestCost, type ActionResult, type OwnCharacter } from '@van-thuong/shared';
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

/**
 * The inns are the reason the enlarged map is survivable: a long walk into the outer hunting grounds
 * has to end somewhere with a bed. These assertions are the authoritative side of that — the client
 * panel only formats what the server allows.
 */
describe('inns and taverns on the expanded maps', () => {
  it('sells a night of rest for a few spirit stones, but only next to the innkeeper', async () => {
    const sessions = [makeDemoSession(), makeDemoSession()];
    const store = new MemoryStore();
    const guest = newCharacter(sessions[0].identity.uid, { name: 'Lữ Khách', gender: 'nam', appearance: DEFAULT_APPEARANCE });
    guest.scene = 'village';
    guest.position = { ...NPCS.innkeeper.position };
    guest.resources = { stones: 40, herbs: 0, ore: 0, ink: 0 };
    guest.hp = 10; guest.mp = 5;
    const farAway = newCharacter(sessions[1].identity.uid, { name: 'Người Xa', gender: 'nu', appearance: DEFAULT_APPEARANCE });
    farAway.scene = 'village';
    farAway.position = { x: NPCS.innkeeper.position.x + 30, y: 0, z: NPCS.innkeeper.position.z };
    farAway.resources = { stones: 40, herbs: 0, ore: 0, ink: 0 };
    farAway.hp = 10; farAway.mp = 5;
    await store.create(guest); await store.create(farAway);

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
    const [a, b] = sockets;
    try {
      const [view] = await Promise.all(sockets.map((socket) => next<OwnCharacter>(socket, 'character')));
      expect(view.hp).toBe(10);

      // Standing across the square is not standing at the counter.
      expect((await ack(b, 'inn:rest', { npcId: 'innkeeper' })).ok).toBe(false);
      // An NPC id that is not an innkeeper is rejected outright, whatever the client claims.
      expect((await ack(a, 'inn:rest', { npcId: 'master' })).ok).toBe(false);

      const rest = await ack(a, 'inn:rest', { npcId: 'innkeeper' });
      expect(rest.ok).toBe(true);
      if (rest.ok) {
        expect(rest.character?.hp).toBe(rest.character?.maxHp);
        expect(rest.character?.mp).toBe(rest.character?.maxMp);
        expect(rest.character?.resources.stones).toBe(40 - innRestCost('innkeeper'));
      }
      // Already rested: no second charge for an empty bed.
      expect((await ack(a, 'inn:rest', { npcId: 'innkeeper' })).ok).toBe(false);
      const stored = await store.get(guest.ownerUid);
      expect(stored?.resources.stones).toBe(40 - innRestCost('innkeeper'));
    } finally { sockets.forEach((socket) => socket.disconnect()); await server.close(); }
  }, 12_000);

  it('lists the three inns with a place to stand in front of each', () => {
    expect(INN_NPCS).toHaveLength(3);
    for (const id of INN_NPCS) {
      const scene = (NPCS[id] as { scene?: string }).scene ?? 'overworld';
      expect(['village', 'overworld']).toContain(scene);
      // The role string is what the HUD and the map tooltip show, so it must name the building.
      expect(NPCS[id].role.length).toBeGreaterThan(10);
      expect(innRestCost(id)).toBeGreaterThan(0);
      expect(innRestCost(id)).toBeLessThan(20);
    }
    // A disciple sleeps cheap inside the sect; the road is dearer, and the wine house dearest.
    expect(innRestCost('sect_inn')).toBeLessThan(innRestCost('tavern'));
    expect(innRestCost('innkeeper')).toBeLessThan(innRestCost('tavern'));
  });
});
