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
/** Create a Firebase account, then send the verification mail the server's admin claim requires. */
export async function registerPassword(email: string, password: string, displayName: string): Promise<void> {
  const { auth, module } = await client();
  const credential = await module.createUserWithEmailAndPassword(auth, email, password);
  const name = displayName.trim();
  if (name) await module.updateProfile(credential.user, { displayName: name.slice(0, 40) });
  await module.sendEmailVerification(credential.user).catch(() => {});
}
export async function resendVerification(): Promise<void> {
  const { auth, module } = await client();
  if (auth.currentUser) await module.sendEmailVerification(auth.currentUser);
}
export async function resetPassword(email: string): Promise<void> {
  const { auth, module } = await client();
  await module.sendPasswordResetEmail(auth, email);
}

/** Firebase error codes translated once, so the login card never leaks English jargon. */
export function describeAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/invalid-email': return 'Email không hợp lệ.';
    case 'auth/missing-password': return 'Vui lòng nhập mật khẩu.';
    case 'auth/weak-password': return 'Mật khẩu quá yếu: cần tối thiểu 6 ký tự.';
    case 'auth/email-already-in-use': return 'Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Email hoặc mật khẩu không đúng.';
    case 'auth/too-many-requests': return 'Bạn thử quá nhiều lần. Vui lòng chờ vài phút rồi thử lại.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Bạn đã đóng cửa sổ đăng nhập Google.';
    case 'auth/popup-blocked': return 'Trình duyệt chặn cửa sổ đăng nhập. Hãy cho phép popup rồi thử lại.';
    case 'auth/network-request-failed': return 'Kết nối mạng không ổn định. Vui lòng thử lại.';
    case 'auth/operation-not-allowed': return 'Phương thức đăng nhập này chưa được bật cho máy chủ.';
    case 'auth/unauthorized-domain': return 'Tên miền này chưa được cho phép trong Firebase Auth.';
    default: return error instanceof Error && error.message ? error.message : 'Đăng nhập không thành công.';
  }
}
export async function logoutFirebase(): Promise<void> {
  if (!firebaseEnabled) return;
  const { auth, module } = await client();
  await module.signOut(auth);
}
