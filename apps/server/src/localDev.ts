import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Identity } from './auth.js';

/** Never use a Firebase UID here: the local sandbox is deliberately a different account/database. */
export const LOCAL_DEV_UID = 'local-dev-daniel965';
export const LOCAL_DEV_NAME = 'Daniel965';
export const LOCAL_DATA_DIR = fileURLToPath(new URL('../../../.local-data/', import.meta.url));
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const GUEST_UID = /^demo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type SessionData = { v: 1; uid: string; expiresAt: number };

/** The automatic account is ONLY available to `npm run dev` in demo mode, never Firebase or production. */
export function isLocalDevLaunch(env: NodeJS.ProcessEnv = process.env): boolean {
  const demo = env.DEMO_MODE === 'true' ||
    (env.DEMO_MODE === undefined && env.NODE_ENV !== 'production' && !env.MONGO_URI && !env.FIREBASE_PROJECT_ID);
  return env.npm_lifecycle_event === 'dev' && env.NODE_ENV !== 'production' && demo;
}

/** Signed bearer sessions survive a dev-server restart; their key is private and never checked into Git. */
export class LocalDevSessions {
  private constructor(private readonly secret: Buffer) {}

  static async open(directory: string = LOCAL_DATA_DIR): Promise<LocalDevSessions> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const keyFile = join(directory, '.session-key');
    try { await writeFile(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const secret = await readFile(keyFile);
    if (secret.length !== 32) throw new Error('Local dev session key is invalid; refusing to replace it or existing saves.');
    return new LocalDevSessions(secret);
  }

  private identity(uid: string): Identity {
    return { uid, displayName: uid === LOCAL_DEV_UID ? LOCAL_DEV_NAME : 'Lữ khách',
      provider: 'demo', isAdmin: false, ...(uid === LOCAL_DEV_UID ? { localDev: true as const } : {}) };
  }

  private issue(uid: string, now = Date.now()): { token: string; identity: Identity } {
    const body = Buffer.from(JSON.stringify({ v: 1, uid, expiresAt: now + SESSION_LIFETIME } satisfies SessionData)).toString('base64url');
    const mac = createHmac('sha256', this.secret).update(body).digest('base64url');
    return { token: `ld1.${body}.${mac}`, identity: this.identity(uid) };
  }

  issueDev(): { token: string; identity: Identity } { return this.issue(LOCAL_DEV_UID); }
  issueGuest(): { token: string; identity: Identity } { return this.issue(`demo-${randomUUID()}`); }

  verify(token: unknown, now = Date.now()): Identity {
    const invalid = () => new Error('Phiên chơi thử đã hết hạn hoặc không hợp lệ.');
    if (typeof token !== 'string' || token.length > 512) throw invalid();
    const [version, body, signature, extra] = token.split('.');
    if (version !== 'ld1' || !body || !signature || extra ||
      !/^[\w-]+$/.test(body) || !/^[\w-]+$/.test(signature)) throw invalid();
    const expected = createHmac('sha256', this.secret).update(body).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw invalid();
    let data: SessionData;
    try { data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionData; }
    catch { throw invalid(); }
    if (data.v !== 1 || typeof data.uid !== 'string' ||
      (data.uid !== LOCAL_DEV_UID && !GUEST_UID.test(data.uid)) ||
      !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + SESSION_LIFETIME)
      throw invalid();
    return this.identity(data.uid);
  }
}

/** Local dev power is a server-issued demo identity, NOT the Firebase/admin database role. */
export function isLocalDevIdentity(identity: Identity): boolean {
  return identity.provider === 'demo' && identity.uid === LOCAL_DEV_UID && identity.localDev === true;
}
