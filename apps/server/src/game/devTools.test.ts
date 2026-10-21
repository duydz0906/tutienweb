import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as clientIo, type Socket as ClientSocket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, LEVEL_CONFIG, MAX_REALM, type ActionResult, type CharacterState, type OwnCharacter } from '@van-thuong/shared';
import { makeDemoSession, type Identity } from '../auth.js';
import { MemoryCache } from '../db/cache.js';
import { MemoryStore } from '../db/store.js';
import { newCharacter } from './rules.js';
import { World } from './World.js';

const admin: Identity = { uid: 'dev-shortcut-admin', displayName: 'Dev', provider: 'password', isAdmin: true };

function ack(socket: ClientSocket, event: string, payload: object = {}): Promise<ActionResult> {
  return new Promise((resolve, reject) => socket.timeout(4000).emit(event, payload,
    (error: Error | null, result: ActionResult) => error ? reject(error) : resolve(result)));
}
function nextCharacter(socket: ClientSocket): Promise<OwnCharacter> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No character')), 4000);
    socket.once('character', (value: OwnCharacter) => { clearTimeout(timer); resolve(value); });
  });
}

/** Boot the real World with a dev character and one ordinary player, both connected. */
async function harness(mutate: (c: CharacterState) => void) {
  const guest = makeDemoSession();
  // Admin *role* lives in the store: the verified claim alone must never be enough.
  class RoleStore extends MemoryStore { override async hasAdminRole(uid: string) { return uid === admin.uid; } }
  const store = new RoleStore();
  const dev = newCharacter(admin.uid, { name: 'Thiên Đạo', gender: 'nam', appearance: DEFAULT_APPEARANCE });
  dev.devMode = true;
  dev.devModeBackup = {
    root: structuredClone(dev.root), realm: 2, minorStage: 3, cultivation: 500, totalCultivation: 500,
    hp: 140, mp: 140, maxHp: 140, maxMp: 140, resources: { ...dev.resources }, contribution: 0,
    path: 'kiem', gender: 'nam', appearance: structuredClone(dev.appearance),
    learnedSkills: ['spirit_cut'], hotbar: [...dev.hotbar], inventory: structuredClone(dev.inventory),
    equipment: structuredClone(dev.equipment), stash: [], flying: false, buffs: [],
  } as NonNullable<CharacterState['devModeBackup']>;
  mutate(dev);
  const mortal = newCharacter(guest.identity.uid, { name: 'Thường Dân', gender: 'nu', appearance: DEFAULT_APPEARANCE });
  await store.create(dev); await store.create(mortal);

  const http = createServer();
  const io = new Server(http, { transports: ['websocket'] });
  const cache = new MemoryCache();
  const world = new World(io, store, cache);
  // Only the harness decides who is the verified admin; the client cannot claim it.
  io.use((socket, next) => {
    socket.data.identity = socket.handshake.auth.token === 'admin-token' ? admin : guest.identity;
    next();
  });
  io.on('connection', (socket) => { void world.join(socket, socket.data.identity as Identity); });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const a = clientIo(url, { transports: ['websocket'], auth: { token: 'admin-token' } });
  const b = clientIo(url, { transports: ['websocket'], auth: { token: guest.token } });
  await Promise.all([nextCharacter(a), nextCharacter(b)]);
  return {
    a, b, store,
    saved: () => store.get(admin.uid) as Promise<CharacterState>,
    async close() {
      a.disconnect(); b.disconnect();
      await world.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await cache.close();
    },
  };
}

describe('dev sandbox shortcuts (server-owned)', () => {
  it('refuses +1 cảnh giới and path swaps for players without dev power', async () => {
    const h = await harness((c) => { c.realm = 3; c.minorStage = 4; });
    try {
      expect((await ack(h.b, 'dev:advance-realm')).ok).toBe(false);
      expect((await ack(h.b, 'dev:set-path', { path: 'ma' })).ok).toBe(false);
    } finally { await h.close(); }
  });

  it('adds one major realm with full HP/MP, then walks minor stages at the ceiling', async () => {
    const h = await harness((c) => { c.realm = 3; c.minorStage = 4; c.maxHp = 400; c.maxMp = 300; c.hp = 10; c.mp = 10; });
    try {
      expect((await ack(h.a, 'dev:advance-realm')).ok).toBe(true);
      const afterStep = await h.saved();
      expect([afterStep.realm, afterStep.minorStage]).toEqual([4, 1]);
      expect(afterStep.maxHp).toBe(400 + LEVEL_CONFIG.majorReward.maxHp);
      expect([afterStep.hp, afterStep.mp]).toEqual([afterStep.maxHp, afterStep.maxMp]);
      expect(afterStep.highestRealm).toBe(4);
      // The pre-dev snapshot still holds the real save, so revoking cannot invent realms.
      expect(afterStep.devModeBackup?.realm).toBe(2);
    } finally { await h.close(); }

    const top = await harness((c) => { c.realm = MAX_REALM; c.minorStage = LEVEL_CONFIG.minorStages - 1; });
    try {
      expect((await ack(top.a, 'dev:advance-realm')).ok).toBe(true);
      expect((await top.saved()).minorStage).toBe(LEVEL_CONFIG.minorStages);
      expect((await top.saved()).realm).toBe(MAX_REALM);
      expect((await ack(top.a, 'dev:advance-realm')).ok).toBe(false);
    } finally { await top.close(); }
  });

  it('switches path instantly, granting that path techniques and a rebuilt hotbar', async () => {
    const h = await harness((c) => { c.realm = 4; c.minorStage = 1; });
    try {
      expect((await ack(h.a, 'dev:set-path', { path: 'thu' })).ok).toBe(true);
      const swapped = await h.saved();
      expect(swapped.path).toBe('thu');
      expect(swapped.hotbar[0]).toBe('spirit_cut');
      expect(swapped.hotbar.filter(Boolean).length).toBeGreaterThan(1);
      expect(swapped.learnedSkills.length).toBeGreaterThan(1);
      expect((await ack(h.a, 'dev:set-path', { path: 'khong_co' })).ok).toBe(false);
      expect((await ack(h.a, 'dev:set-path', { path: 'ma' })).ok).toBe(true);
      expect((await h.saved()).path).toBe('ma');
    } finally { await h.close(); }
  });
});
