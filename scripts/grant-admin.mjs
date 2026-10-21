/* One-time, server-side Firebase provisioning. Never accepts or stores a password. */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { applicationDefault, initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const uid = process.env.ADMIN_FIREBASE_UID;
if (!uid || !process.env.FIREBASE_PROJECT_ID) throw new Error('Set ADMIN_FIREBASE_UID and FIREBASE_PROJECT_ID in the root .env first.');
if (process.env.CONFIRM_ADMIN_GRANT !== 'daniel965') throw new Error('Set CONFIRM_ADMIN_GRANT=daniel965 for this one-time command.');
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const auth = getAuth();
const user = await auth.getUser(uid);
if (user.disabled || !user.emailVerified) throw new Error('The pinned Firebase user must be enabled with a VERIFIED email.');
const claims = user.customClaims ?? {};
await auth.setCustomUserClaims(uid, { ...claims, admin: true });
console.info('Admin claim provisioned for the pinned Firebase UID. Sign out and sign back in to refresh the ID token.');
