import type { User } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};
export const firebaseEnabled = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

/** Google/password code is lazy: demo players never download Firebase Auth. */
async function loadClient() {
  if (!firebaseEnabled) throw new Error('Firebase chưa được cấu hình.');
  const [appModule, authModule] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  const app = appModule.getApps()[0] ?? appModule.initializeApp(config);
  return { auth: authModule.getAuth(app), module: authModule };
}
let clientPromise: ReturnType<typeof loadClient> | null = null;
function client() { return clientPromise ??= loadClient(); }

export function observeFirebase(callback: (user: User | null) => void): () => void {
  if (!firebaseEnabled) return () => {};
  let disposed = false;
  let unsubscribe = () => {};
  void client().then(({ auth, module }) => {
    if (!disposed) unsubscribe = module.onAuthStateChanged(auth, callback);
  }).catch(() => { if (!disposed) callback(null); });
  return () => { disposed = true; unsubscribe(); };
}
export async function loginGoogle(): Promise<void> {
  const { auth, module } = await client();
  await module.signInWithPopup(auth, new module.GoogleAuthProvider());
}
export async function loginPassword(email: string, password: string): Promise<void> {
  const { auth, module } = await client();
  await module.signInWithEmailAndPassword(auth, email, password);
}
export async function logoutFirebase(): Promise<void> {
  if (!firebaseEnabled) return;
  const { auth, module } = await client();
  await module.signOut(auth);
}
