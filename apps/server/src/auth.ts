import { randomBytes, randomUUID } from 'node:crypto';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { isLocalDevLaunch, LocalDevSessions } from './localDev.js';

export type Identity = { uid: string; displayName: string; provider: 'google' | 'password' | 'demo'; isAdmin: boolean;
  /** Set only by the server when verifying a signed local-dev session; not a Firebase role. */ localDev?: true };
const demoSessions = new Map<string, { identity: Identity; expiresAt: number }>();
export const demoMode = process.env.DEMO_MODE === 'true' || (
  process.env.DEMO_MODE === undefined && process.env.NODE_ENV !== 'production' && !process.env.MONGO_URI && !process.env.FIREBASE_PROJECT_ID
);
export const localDevMode = demoMode && isLocalDevLaunch();
let localSessions: LocalDevSessions | null = null;

export async function initializeAuthentication(): Promise<void> {
  if (demoMode) {
    if (process.env.NODE_ENV === 'production') throw new Error('DEMO_MODE cannot be enabled in production.');
    if (localDevMode) {
      localSessions = await LocalDevSessions.open();
      console.info('[auth] Isolated local dev sandbox; Firebase admin privileges are OFF.');
    } else console.info('[auth] Ephemeral demo mode; Firebase and admin privileges are OFF.');
    return;
  }
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.ADMIN_FIREBASE_UID) {
    throw new Error('FIREBASE_PROJECT_ID and ADMIN_FIREBASE_UID are required in production mode.');
  }
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
}

export function makeDemoSession(): { token: string; identity: Identity } {
  if (!demoMode) throw new Error('Demo sessions are disabled.');
  if (localDevMode) {
    if (!localSessions) throw new Error('Local dev sessions have not been initialized.');
    return localSessions.issueGuest();
  }
  const token = randomBytes(32).toString('base64url');
  const identity: Identity = { uid: `demo-${randomUUID()}`, displayName: 'Lữ khách', provider: 'demo', isAdmin: false };
  demoSessions.set(token, { identity, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  return { token, identity };
}

export function makeLocalDevSession(): { token: string; identity: Identity } {
  if (!localDevMode || !localSessions) throw new Error('Local dev login is disabled.');
  return localSessions.issueDev();
}

/** Nothing supplied by a client (name, isAdmin, role) can grant a privilege. */
export async function verifyIdentity(token: unknown): Promise<Identity> {
  if (typeof token !== 'string' || token.length < 10 || token.length > 8192) throw new Error('Thiếu phiên đăng nhập hợp lệ.');
  if (demoMode) {
    if (localDevMode) {
      if (!localSessions) throw new Error('Local dev sessions have not been initialized.');
      return localSessions.verify(token);
    }
    const session = demoSessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      demoSessions.delete(token);
      throw new Error('Phiên chơi thử đã hết hạn.');
    }
    return session.identity;
  }
  const decoded = await getAuth().verifyIdToken(token, true);
  const provider = decoded.firebase.sign_in_provider;
  if (provider !== 'google.com' && provider !== 'password') throw new Error('Phương thức đăng nhập không được hỗ trợ.');
  // Require the verified identity, a claim set by the Admin SDK, AND a pinned UID.
  const isAdmin = decoded.admin === true && decoded.uid === process.env.ADMIN_FIREBASE_UID && decoded.email_verified === true;
  return {
    uid: decoded.uid,
    displayName: (decoded.name || decoded.email || 'Đạo hữu').slice(0, 80),
    provider: provider === 'password' ? 'password' : 'google',
    isAdmin,
  };
}
