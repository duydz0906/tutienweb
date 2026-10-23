import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, HOME_GATE, type ActionResult, type MotionUpdate, type OwnCharacter, type WorldSnapshot } from '@van-thuong/shared';
import { makeDemoSession, verifyIdentity, type Identity } from '../auth.js';
import { MemoryCache } from '../db/cache.js';
import { MemoryStore } from '../db/store.js';
import { newCharacter } from './rules.js';
import { World } from './World.js';

function ack(socket: ClientSocket, event: string, payload: object = {}): Promise<ActionResult> {
  return new Promise((resolve, reject) => socket.timeout(4000).emit(event, payload,
    (error: Error | null, result: ActionResult) => error ? reject(error) : resolve(result)));
}

/** Collects `motion` packets for a while, which is exactly what the client's interpolation eats. */
function collect(socket: ClientSocket, milliseconds: number): Promise<MotionUpdate[]> {
  return new Promise((resolve) => {
    const seen: MotionUpdate[] = [];
    const listener = (update: MotionUpdate) => seen.push(update);
    socket.on('motion', listener);
    setTimeout(() => { socket.off('motion', listener); resolve(seen); }, milliseconds);
  });
}

/**
 * Private rooms and the tribulation arena have no public world snapshot, so their movement used to
 * reach the client once a second (with the periodic `character` packet) — a walk drawn as a stutter.
 * The server now streams a 10 Hz position reference for exactly those scenes.
 */
describe('10 Hz motion reference for scenes without a snapshot', () => {
  it('streams positions inside a private room and stays quiet on the public maps', async () => {
    const session = makeDemoSession();
    const store = new MemoryStore();
    const character = newCharacter(session.identity.uid, { name: 'Tĩnh Tọa', gender: 'nam', appearance: DEFAULT_APPEARANCE });
    character.scene = 'overworld';
    character.position = { ...HOME_GATE.position };
    await store.create(character);

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
    const socket = clientIo(url, { transports: ['websocket'], auth: { token: session.token } });
    try {
      await new Promise<OwnCharacter>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No character')), 4000);
        socket.once('character', (value: OwnCharacter) => { clearTimeout(timer); resolve(value); });
      });

      // Out in the sect there is a world snapshot on the same 100 ms cadence; no duplicate stream.
      expect(await collect(socket, 320)).toHaveLength(0);

      // …and that cadence is a fixed grid. It used to be "now + 100", which a tick landing a few
      // milliseconds late turned into 150 ms — the client then had to extrapolate a sixth of a second
      // at a time, which at flight speed is the hitch riders reported.
      const snapshots = await new Promise<number[]>((resolve) => {
        const seen: number[] = [];
        const listener = () => seen.push(Date.now());
        socket.on('world', listener);
        setTimeout(() => { socket.off('world', listener); resolve(seen); }, 700);
      });
      expect(snapshots.length).toBeGreaterThanOrEqual(5);
      const gaps = snapshots.slice(1).map((t, i) => t - snapshots[i]!);
      for (const gap of gaps) expect(gap).toBeGreaterThan(70);
      for (const gap of gaps) expect(gap).toBeLessThan(140);

      expect((await ack(socket, 'home:enter')).ok).toBe(true);
      const packets = await collect(socket, 420);
      expect(packets.length).toBeGreaterThanOrEqual(3);
      expect(packets.length).toBeLessThanOrEqual(6);
      for (const packet of packets) {
        expect(packet.scene).toBe('residence');
        expect(Number.isFinite(packet.position.x) && Number.isFinite(packet.position.z)).toBe(true);
        expect(Number.isFinite(packet.rotation)).toBe(true);
      }
      // Timestamps are the client's clock for interpolation: they must increase, never repeat out of order.
      for (let i = 1; i < packets.length; i++) expect(packets[i]!.at).toBeGreaterThanOrEqual(packets[i - 1]!.at);
    } finally {
      socket.disconnect();
      await world.close();
      await new Promise<void>((resolve, reject) => io.close((error) => error ? reject(error) : resolve()));
      await server.close();
    }
  }, 15_000);
});
