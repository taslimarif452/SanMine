import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  Auth,
} from 'firebase/auth';

/**
 * Firebase Configuration for SANMine Authentication
 * Supports Vite environment variables with hardcoded fallbacks to the provided config.
 * Trims all environment inputs to prevent trailing/leading whitespace mismatches.
 */
const firebaseConfig = {
  apiKey:
    (typeof import.meta.env.VITE_FIREBASE_API_KEY === 'string' && import.meta.env.VITE_FIREBASE_API_KEY.trim()) ||
    'AIzaSyCMXP_UC6OcBU4rC4tThml8pgLTyeCl0yTY',
  authDomain:
    (typeof import.meta.env.VITE_FIREBASE_AUTH_DOMAIN === 'string' && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN.trim()) ||
    'sanmineai.firebaseapp.com',
  projectId:
    (typeof import.meta.env.VITE_FIREBASE_PROJECT_ID === 'string' && import.meta.env.VITE_FIREBASE_PROJECT_ID.trim()) ||
    'sanmineai',
  storageBucket:
    (typeof import.meta.env.VITE_FIREBASE_STORAGE_BUCKET === 'string' && import.meta.env.VITE_FIREBASE_STORAGE_BUCKET.trim()) ||
    'sanmineai.firebasestorage.app',
  messagingSenderId:
    (typeof import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID === 'string' && import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID.trim()) ||
    '436734820307',
  appId:
    (typeof import.meta.env.VITE_FIREBASE_APP_ID === 'string' && import.meta.env.VITE_FIREBASE_APP_ID.trim()) ||
    '1:436734820307:web:600ec83eed40ba404b7926',
  measurementId:
    (typeof import.meta.env.VITE_FIREBASE_MEASUREMENT_ID === 'string' && import.meta.env.VITE_FIREBASE_MEASUREMENT_ID.trim()) ||
    'G-4N8KX8WTXP',
};

// Initialize Firebase once
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Reusable helper to obtain the currently authenticated user's Firebase ID token.
 * Can be sent in headers as: Authorization: Bearer <Firebase_ID_TOKEN>
 */
export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.error('[Firebase Auth] Failed to retrieve ID token:', err);
    return null;
  }
}
