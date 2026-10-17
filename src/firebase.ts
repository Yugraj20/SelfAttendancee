import { Capacitor, registerPlugin } from '@capacitor/core';
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithCredential, signInWithPopup, signOut, type User } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';

interface NativeGoogleAuthPlugin {
  signIn(options?: { serverClientId?: string }): Promise<{ idToken: string }>;
  signOut(): Promise<void>;
}

const NativeGoogleAuth = registerPlugin<NativeGoogleAuthPlugin>('NativeGoogleAuth');
const DEFAULT_WEB_CLIENT_ID = '295288004499-qs61g8hbut4k22bb44hnp5mt7pgms5nu.apps.googleusercontent.com';

const cfg = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID, measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID };
export const firebaseConfigured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
const app = firebaseConfigured ? initializeApp(cfg) : undefined;
export const auth = app ? getAuth(app) : undefined;
// Firestore backs the optional cross-device sync layer (see sync.ts). IndexedDB (db.ts) stays
// the source of truth for instant local reads/writes; Firestore is a best-effort mirror per uid.
// ignoreUndefinedProperties: attendance records carry optional fields (timetableId, room, ...) that are
// `undefined` for extra classes, and Firestore rejects undefined values by default — which would make
// every push fail once such a record exists.
export const firestore: Firestore | undefined = app ? initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }) : undefined;
export async function signIn() {
  if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to .env.local.');
  if (Capacitor.isNativePlatform()) {
    const serverClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || DEFAULT_WEB_CLIENT_ID;
    const { idToken } = await NativeGoogleAuth.signIn({ serverClientId });
    const credential = GoogleAuthProvider.credential(idToken);
    return signInWithCredential(auth, credential);
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}
export async function logout() {
  if (Capacitor.isNativePlatform()) {
    await NativeGoogleAuth.signOut().catch(() => {});
  }
  if (auth) await signOut(auth);
}
export type AuthUser = User;
