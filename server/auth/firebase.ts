import { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { upsertUserByFirebaseUid, DbUser } from '../db/chats.js';

// Extend Express Request to attach authenticated database user
declare global {
  namespace Express {
    interface Request {
      user?: DbUser;
      firebaseUid?: string;
    }
  }
}

// Initialize Firebase Admin SDK safely
let adminApp: App | null = null;

/**
 * Safely extracts and canonicalizes the Firebase Project ID from environment variables.
 * Trims any leading/trailing whitespace and falls back to 'sanmineai'.
 */
export function getCanonicalFirebaseProjectId(): string {
  const envVal =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID;

  if (typeof envVal === 'string') {
    const trimmed = envVal.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return 'sanmineai';
}

/**
 * Test helper to allow injecting or resetting adminApp instance in test suites.
 */
export function _setFirebaseAdminAppForTesting(appInstance: App | null = null) {
  adminApp = appInstance;
}

export function ensureFirebaseAdmin(): App | null {
  if (!adminApp) {
    try {
      const existingApps = getApps();
      if (existingApps.length > 0) {
        adminApp = existingApps[0];
        return adminApp;
      }

      const projectId = getCanonicalFirebaseProjectId();

      const serviceAccountRaw =
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
        process.env.FIREBASE_CONFIG ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

      let parsedCert: any = null;
      if (serviceAccountRaw && typeof serviceAccountRaw === 'string') {
        const trimmed = serviceAccountRaw.trim();
        if (trimmed.startsWith('{')) {
          try {
            parsedCert = JSON.parse(trimmed);
          } catch (e) {
            console.warn('[Firebase Admin] Service account JSON parse error:', e);
          }
        } else {
          try {
            const decoded = Buffer.from(trimmed, 'base64').toString('utf-8').trim();
            if (decoded.startsWith('{')) {
              parsedCert = JSON.parse(decoded);
            }
          } catch (e) {
            console.warn('[Firebase Admin] Base64 service account parse error:', e);
          }
        }
      }

      if (parsedCert) {
        if (typeof parsedCert.project_id === 'string') {
          parsedCert.project_id = parsedCert.project_id.trim();
        }
        if (typeof parsedCert.client_email === 'string') {
          parsedCert.client_email = parsedCert.client_email.trim();
        }
        if (typeof parsedCert.private_key === 'string') {
          // Normalize private key if escaped newlines are present
          parsedCert.private_key = parsedCert.private_key.replace(/\\n/g, '\n').trim();
        }
      }

      if (parsedCert && parsedCert.project_id && parsedCert.private_key) {
        const certProjectId = parsedCert.project_id || projectId;
        adminApp = initializeApp({
          credential: cert(parsedCert),
          projectId: certProjectId,
        });
        console.log(`[Firebase Admin Express] Initialized with Service Account for project: ${certProjectId}`);
      } else {
        adminApp = initializeApp({
          projectId,
        });
        console.log(`[Firebase Admin Express] Initialized with default Project ID: ${projectId}`);
      }
    } catch (err) {
      console.warn('[Firebase Admin Express] Initialization warning:', err);
    }
  }
  return adminApp;
}

export interface DecodedFirebaseUser {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Cryptographically verifies a Firebase ID token using Firebase Admin.
 * Rejects invalid, forged, or expired tokens.
 */
export async function verifyFirebaseToken(idToken: string): Promise<DecodedFirebaseUser> {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('No authentication token provided.');
  }

  const app = ensureFirebaseAdmin();
  const auth = app ? getAuth(app) : getAuth();

  try {
    const decoded = await auth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || (decoded as any).display_name,
      picture: decoded.picture || (decoded as any).photo_url,
    };
  } catch (adminError: any) {
    throw new Error(`Firebase token verification failed: ${adminError.message || 'Invalid or expired token'}`);
  }
}

/**
 * Express middleware to strictly require Firebase authentication on protected routes.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      ok: false,
      success: false,
      error: 'Unauthorized: Missing or invalid Authorization Bearer header',
      code: 'AUTH_REQUIRED',
    });
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return res.status(401).json({
      ok: false,
      success: false,
      error: 'Unauthorized: Empty token provided',
      code: 'EMPTY_TOKEN',
    });
  }

  try {
    const decoded = await verifyFirebaseToken(token);

    // Safe logging (never log secrets/tokens)
    console.log(`[CHAT AUTH] firebaseUid=${decoded.uid}`);

    // Upsert user in Neon PostgreSQL
    const dbUser = await upsertUserByFirebaseUid({
      firebaseUid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name,
      photoUrl: decoded.picture,
    });

    req.user = dbUser;
    req.firebaseUid = decoded.uid;
    next();
  } catch (error: any) {
    console.error('[Auth Middleware Error]:', error.message);
    return res.status(401).json({
      ok: false,
      success: false,
      error: error.message || 'Unauthorized: Token verification failed',
      code: 'INVALID_TOKEN',
    });
  }
}

/**
 * Optional authentication middleware: attaches user if token is present, but doesn't block.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next();
  }

  try {
    const decoded = await verifyFirebaseToken(token);
    const dbUser = await upsertUserByFirebaseUid({
      firebaseUid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name,
      photoUrl: decoded.picture,
    });

    req.user = dbUser;
    req.firebaseUid = decoded.uid;
  } catch {
    // Optional auth ignores failure
  }
  next();
}
