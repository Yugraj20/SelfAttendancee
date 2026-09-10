import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, signInWithPopup, signOut, type User } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, type Firestore } from 'firebase/firestore';
const cfg = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID, measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID };
export const firebaseConfigured = Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
const app = firebaseConfigured ? initializeApp(cfg) : undefined;
export const auth = app ? getAuth(app) : undefined;
// Firestore backs the optional cross-device sync layer (see sync.ts). IndexedDB (db.ts) stays
// the source of truth for instant local reads/writes; Firestore is a best-effort mirror per uid.
export const firestore: Firestore | undefined = app ? getFirestore(app) : undefined;
if (firestore) { enableIndexedDbPersistence(firestore).catch(() => { /* multiple tabs open, or unsupported browser — Firestore just falls back to network-only */ }); }
export async function signIn() { if (!auth) throw new Error('Firebase is not configured. Add VITE_FIREBASE_* values to .env.local.'); const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); return signInWithPopup(auth, provider); }
export async function logout() { if (auth) await signOut(auth); }
export type AuthUser = User;
