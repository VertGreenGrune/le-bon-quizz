import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { FirebaseWebConfig } from '@lbq/shared';

/** What the server keeps from a verified Firebase ID token. */
export interface FirebaseIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Verifies a Firebase ID token; throws when it is invalid, expired or for another project. */
export type FirebaseVerifier = (idToken: string) => Promise<FirebaseIdentity>;

/** Public keys Google signs Firebase ID tokens with (rotated, cached by `jose`). */
const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * Checks an ID token as documented by Firebase ("Verify ID tokens using a third-party JWT
 * library"): RS256 signed by Google, `aud` = project id, `iss` = securetoken.google.com/<project>,
 * not expired, `sub` = the user id, `auth_time` in the past. No service account is needed.
 */
export function createFirebaseVerifier(
  projectId: string,
  keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL)),
): FirebaseVerifier {
  return async (idToken) => {
    const { payload } = await jwtVerify(idToken, keys, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
      clockTolerance: 30,
    });
    const authTime = payload.auth_time;
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
      throw new Error('invalid sub');
    }
    if (typeof authTime !== 'number' || authTime > Date.now() / 1000 + 30) {
      throw new Error('invalid auth_time');
    }
    if (typeof payload.email !== 'string' || !payload.email) {
      throw new Error('no e-mail in the token');
    }
    return {
      uid: payload.sub,
      email: payload.email.trim().toLowerCase(),
      emailVerified: payload.email_verified === true,
      ...(typeof payload.name === 'string' && payload.name.trim()
        ? { name: payload.name.trim().slice(0, 60) }
        : {}),
    };
  };
}

/**
 * Firebase settings from the environment: `FIREBASE_PROJECT_ID` + `FIREBASE_API_KEY` turn
 * Firebase Auth on (`FIREBASE_AUTH_DOMAIN` defaults to `<project>.firebaseapp.com`,
 * `FIREBASE_APP_ID` optional). Missing → local accounts. Throws if only one of the two is set.
 */
export function firebaseConfigFromEnv(env: NodeJS.ProcessEnv): FirebaseWebConfig | undefined {
  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  const apiKey = env.FIREBASE_API_KEY?.trim();
  if (!projectId && !apiKey) return undefined;
  if (!projectId || !apiKey) {
    throw new Error('FIREBASE_PROJECT_ID et FIREBASE_API_KEY doivent être définis ensemble');
  }
  return {
    apiKey,
    projectId,
    authDomain: env.FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`,
    ...(env.FIREBASE_APP_ID?.trim() ? { appId: env.FIREBASE_APP_ID.trim() } : {}),
  };
}
