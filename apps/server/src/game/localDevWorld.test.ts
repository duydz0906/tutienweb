import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, NPCS, type ActionResult, type OwnCharacter } from '@van-thuong/shared';
import { MemoryCache } from '../db/cache.js';
import { FileStore } from '../db/fileStore.js';
import { LOCAL_DEV_UID, LocalDevSessions } from '../localDev.js';
import { ensureLocalDevCharacter } from './localDevCharacter.js';
import { newCharacter } from './rules.js';
import { World } from './World.js';

function ack(socket: ClientSocket, event: string, payload: unknown = {}): Promise<ActionResult> {
  return new Promise((resolve, reject) => socket.timeout(4000).emit(event, payload,
    (error: Error | null, result: ActionResult) => error ? reject(error) : resolve(result)));
}
function nextCharacter(socket: ClientSocket): Promise<OwnCharacter> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No character arrived')), 5000);
    socket.once('character', (value: OwnCharacter) => { clearTimeout(timeout); resolve(value); });
  });
}

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('signed local Daniel965 session in the real Socket.IO world', () => {
  it('reuses its own disk save with infinite HP/materials but cannot use Firebase-admin commands', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vanthuong-world-dev-'));
    directories.push(directory);
    const store = new FileStore(directory), cache = new MemoryCache();
    const sessions = await LocalDevSessions.open(directory);
    const dev = sessions.issueDev(), guest = sessions.issueGuest();
    const original = newCharacter(LOCAL_DEV_UID, { name: 'Daniel965', gender: 'nam', appearance: DEFAULT_APPEARANCE });
    original.position = { ...NPCS.shop.position };
    original.resources = { stones: 0, herbs: 0, ore: 0, ink: 0 };
    original.contribution = 0;
    await store.create(original);
    await ensureLocalDevCharacter(store);
    const ordinary = newCharacter(guest.identity.uid, { name: 'Daniel965', gender: 'nam', appearance: DEFAULT_APPEARANCE });
    ordinary.position = { ...NPCS.shop.position };
    ordinary.resources = { stones: 0, herbs: 0, ore: 0, ink: 0 };
    await store.create(ordinary);

    const http = createServer(), io = new Server(http, { transports: ['websocket'] });
    const world = new World(io, store, cache);
    io.use((socket, next) => {
      try { socket.data.identity = sessions.verify(socket.handshake.auth.token); next(); }
      catch { next(new Error('Invalid session')); }
    });
    io.on('connection', (socket) => { void world.join(socket, socket.data.identity); });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const daniel = clientIo(url, { transports: ['websocket'], auth: { token: dev.token, isAdmin: false } });
    const stranger = clientIo(url, { transports: ['websocket'], auth: { token: guest.token, localDev: true, isAdmin: true } });
    try {
      const [self, other] = await Promise.all([nextCharacter(daniel), nextCharacter(stranger)]);
      expect([self.id, self.name, self.isAdmin, self.devMode, self.hp]).toEqual([original.id, 'Daniel965', false, true, 999_999_999]);
      expect(self.resources).toEqual({ stones: 999_999_999, herbs: 999_999_999, ore: 999_999_999, ink: 999_999_999 });
      expect(other.devMode).toBe(false);
      expect(other.isAdmin).toBe(false);
      expect((await ack(stranger, 'craft', { recipeId: 'fate_orb' })).ok).toBe(false);
      expect((await ack(stranger, 'shop:buy', { offerId: 'foundation_pill' })).ok).toBe(false);
      expect((await ack(daniel, 'shop:buy', { offerId: 'foundation_pill' })).ok).toBe(true);
      expect((await ack(daniel, 'craft', { recipeId: 'fate_orb' })).ok).toBe(true);
      expect((await ack(daniel, 'place-array')).ok).toBe(true);
      expect((await ack(daniel, 'admin:action', { type: 'spawn-item', itemId: 'immortal_sword' })).ok).toBe(false);
      expect((await ack(daniel, 'chat', '/devmode')).ok).toBe(false); // chat command still needs verified Firebase admin + DB role
      const saved = await store.get(LOCAL_DEV_UID);
      expect(saved?.resources).toEqual({ stones: 0, herbs: 0, ore: 0, ink: 0 });
      expect(saved?.contribution).toBe(0);
      expect(saved?.inventory.map((item) => item.itemId)).toContain('fate_orb');
      expect(saved?.inventory.map((item) => item.itemId)).toContain('foundation_pill');
      expect((await store.get(guest.identity.uid))?.inventory).toHaveLength(2);
      expect((await cache.leaderboard()).map((entry) => entry.id)).toEqual([ordinary.id]);
    } finally {
      daniel.disconnect(); stranger.disconnect();
      await world.close();
      await new Promise<void>((resolve, reject) => io.close((error) => error ? reject(error) : resolve()));
      await cache.close(); await store.close();
    }
    const restarted = new FileStore(directory);
    const loaded = await ensureLocalDevCharacter(restarted);
    expect(loaded.id).toBe(original.id);
    expect(loaded.inventory.some((item) => item.itemId === 'fate_orb')).toBe(true);
    expect(loaded.resources.stones).toBe(0);
    expect((await restarted.get(guest.identity.uid))?.id).toBe(ordinary.id);
    const resumedSessions = await LocalDevSessions.open(directory);
    expect(resumedSessions.verify(dev.token).uid).toBe(LOCAL_DEV_UID);
    expect(resumedSessions.verify(guest.token).uid).toBe(guest.identity.uid);
    await restarted.close();
  }, 12_000);
});
