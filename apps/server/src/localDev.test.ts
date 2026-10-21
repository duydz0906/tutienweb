import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '@van-thuong/shared';
import { FileStore } from './db/fileStore.js';
import { hasDevPower, ownCharacter } from './game/devMode.js';
import { ensureLocalDevCharacter } from './game/localDevCharacter.js';
import { newCharacter } from './game/rules.js';
import { isLocalDevIdentity, isLocalDevLaunch, LOCAL_DEV_UID, LocalDevSessions } from './localDev.js';

const directories: string[] = [];
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'vanthuong-local-dev-'));
  directories.push(path);
  return path;
}
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

const make = (uid: string, name = 'Người Chơi') => newCharacter(uid, { name, gender: 'nam', appearance: DEFAULT_APPEARANCE });

describe('npm run dev isolation and signed local sessions', () => {
  it('never enables automatic login under production, explicit non-demo, start or test', () => {
    expect(isLocalDevLaunch({ npm_lifecycle_event: 'dev' })).toBe(true);
    expect(isLocalDevLaunch({ npm_lifecycle_event: 'dev', DEMO_MODE: 'true', MONGO_URI: 'mongodb://example' })).toBe(true);
    expect(isLocalDevLaunch({ npm_lifecycle_event: 'dev', DEMO_MODE: 'false' })).toBe(false);
    expect(isLocalDevLaunch({ npm_lifecycle_event: 'dev', FIREBASE_PROJECT_ID: 'prod' })).toBe(false);
    expect(isLocalDevLaunch({ npm_lifecycle_event: 'dev', NODE_ENV: 'production', DEMO_MODE: 'true' })).toBe(false);
    expect(isLocalDevLaunch({ npm_lifecycle_event: 'start', DEMO_MODE: 'true' })).toBe(false);
    expect(isLocalDevLaunch({ npm_lifecycle_event: 'test', DEMO_MODE: 'true' })).toBe(false);
  });

  it('keeps a private signing key across server restarts; never accepts a client-provided UID or admin role', async () => {
    const path = await directory();
    const sessions = await LocalDevSessions.open(path);
    const dev = sessions.issueDev(), guest = sessions.issueGuest();
    expect(sessions.verify(dev.token)).toMatchObject({ uid: LOCAL_DEV_UID, localDev: true, isAdmin: false });
    expect(isLocalDevIdentity(sessions.verify(guest.token))).toBe(false);
    expect(sessions.verify(guest.token).isAdmin).toBe(false);
    expect((await LocalDevSessions.open(path)).verify(dev.token)).toEqual(sessions.verify(dev.token));
    expect((await readFile(join(path, '.session-key'))).length).toBe(32);
    const [version, body, signature] = guest.token.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, uid: LOCAL_DEV_UID, isAdmin: true,
      expiresAt: Date.now() + 1000 })).toString('base64url');
    expect(() => sessions.verify(`${version}.${forged}.${signature}`)).toThrow('không hợp lệ');
    expect(() => sessions.verify('ld1.arbitrary.claimed-admin')).toThrow('không hợp lệ');
    expect(() => sessions.verify(dev.token, Date.now() + 31 * 24 * 60 * 60 * 1000)).toThrow('hết hạn');
    await writeFile(join(path, '.session-key'), 'broken-key');
    await expect(LocalDevSessions.open(path)).rejects.toThrow('invalid'); // cannot silently replace existing saves
    expect(body).toBeTruthy();
  });
});

describe('per-user local saves', () => {
  it('loads Daniel965 again without rerolling or erasing progress and stores each player in a separate directory', async () => {
    const path = await directory();
    const store = new FileStore(path);
    const original = make(LOCAL_DEV_UID, 'Tên Cũ');
    original.position.z = 17; original.resources.stones = 0; original.contribution = 47;
    original.appearance.hairColor = 'silver'; original.storyStep = 2;
    await store.create(original);
    const first = await ensureLocalDevCharacter(store);
    expect(first.id).toBe(original.id);
    expect(first.name).toBe('Daniel965');
    expect(first.devModeBackup?.root).toEqual(original.root);
    expect(first.devModeBackup?.resources?.stones).toBe(0);
    expect(first.devModeBackup?.contribution).toBe(47);
    expect([first.position.z, first.storyStep, first.appearance.hairColor]).toEqual([17, 2, 'silver']);
    expect(hasDevPower(first, { uid: LOCAL_DEV_UID, provider: 'demo', displayName: 'Daniel965', isAdmin: false, localDev: true })).toBe(true);
    const normalView = ownCharacter(first, { uid: LOCAL_DEV_UID, provider: 'demo', displayName: 'Giả mạo', isAdmin: false });
    expect(normalView.devMode).toBe(false);
    expect(normalView.resources.stones).toBe(0);
    const devView = ownCharacter(first, { uid: LOCAL_DEV_UID, provider: 'demo', displayName: 'Daniel965', isAdmin: false, localDev: true });
    expect(devView.isAdmin).toBe(false);
    expect(devView.resources).toEqual({ stones: 999_999_999, herbs: 999_999_999, ore: 999_999_999, ink: 999_999_999 });
    expect(devView.contribution).toBe(999_999_999);
    expect((await store.get(LOCAL_DEV_UID))?.resources.stones).toBe(0); // no fake balance persisted

    const guest = make('demo-guest', 'Daniel965'); // name alone never grants privileges
    await store.create(guest);
    await store.close();
    const restarted = new FileStore(path);
    const second = await ensureLocalDevCharacter(restarted);
    expect(second).toEqual(first);
    expect((await restarted.get('demo-guest'))?.id).toBe(guest.id);
    expect((await restarted.get('demo-guest'))?.devMode).toBe(false);
    expect(await readFile(join(path, 'players', 'Daniel965', 'character.json'), 'utf8')).toContain(original.id);
    expect((await restarted.get('../../escape'))).toBeNull();
    await restarted.close();
  });

  it('creates once under concurrent requests and refuses to overwrite a corrupt save with a new character', async () => {
    const path = await directory();
    const store = new FileStore(path);
    const first = make(LOCAL_DEV_UID), second = make(LOCAL_DEV_UID);
    const [a, b] = await Promise.all([store.create(first), store.create(second)]);
    expect(a.id).toBe(b.id);
    const active = await ensureLocalDevCharacter(store);
    active.resources.stones = 14;
    await Promise.all([store.save(active), store.save({ ...active, resources: { ...active.resources, stones: 22 } })]);
    expect((await store.get(LOCAL_DEV_UID))?.resources.stones).toBe(22);
    await writeFile(join(path, 'players', 'Daniel965', 'character.json'), '{not-json');
    await expect(store.get(LOCAL_DEV_UID)).rejects.toThrow();
    await expect(store.create(make(LOCAL_DEV_UID))).rejects.toThrow();
    expect(await readFile(join(path, 'players', 'Daniel965', 'character.json'), 'utf8')).toBe('{not-json');
  });
});
