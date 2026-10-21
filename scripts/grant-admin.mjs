/* One-time, server-side Firebase + MongoDB provisioning. Never accepts or stores a password. */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { applicationDefault, initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const uid = process.env.ADMIN_FIREBASE_UID;
if (!uid || !process.env.FIREBASE_PROJECT_ID || !process.env.MONGO_URI)
  throw new Error('Set ADMIN_FIREBASE_UID, FIREBASE_PROJECT_ID and MONGO_URI in the root .env first.');
if (process.env.CONFIRM_ADMIN_GRANT !== 'daniel965')
  throw new Error('Set CONFIRM_ADMIN_GRANT=daniel965 for this one-time command.');
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const auth = getAuth();
const user = await auth.getUser(uid);
if (user.disabled || !user.emailVerified) throw new Error('The pinned Firebase user must be enabled with a VERIFIED email.');

// A verified custom claim is necessary but not sufficient; /devmode also checks this
// independently revokable database role. Only this explicit operator command grants it.
const connection = await mongoose.createConnection(process.env.MONGO_URI, { serverSelectionTimeoutMS: 7000 }).asPromise();
try {
  const now = new Date();
  await connection.collection('users').updateOne({ firebaseUid: uid }, {
    $set: { role: 'admin', updatedAt: now },
    $setOnInsert: {
      firebaseUid: uid, displayName: (user.displayName || user.email || 'Quản trị viên').slice(0, 80),
      provider: user.providerData.some((entry) => entry.providerId === 'google.com') ? 'google' : 'password',
      lastLoginAt: now, createdAt: now,
    },
  }, { upsert: true });
  await auth.setCustomUserClaims(uid, { ...(user.customClaims ?? {}), admin: true });
  console.info('Pinned UID provisioned with BOTH Firebase admin claim and MongoDB admin role. Sign out and sign back in to refresh the ID token.');
} finally { await connection.close(); }
