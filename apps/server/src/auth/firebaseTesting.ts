/** Test helper (T46): Firebase-like ID tokens signed by a local key — no network, no Firebase. */
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { createFirebaseVerifier } from './firebase.js';

export const FAKE_FIREBASE_PROJECT = 'lbq-test';

/** A local RSA key standing in for Google's: `sign` makes Firebase-like ID tokens. */
export async function fakeFirebase(projectId = FAKE_FIREBASE_PROJECT) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const verify = createFirebaseVerifier(projectId, createLocalJWKSet({ keys: [jwk] }));
  const sign = (
    claims: Record<string, unknown> = {},
    opts: { aud?: string; iss?: string; exp?: string; sub?: string } = {},
  ) =>
    new SignJWT({ auth_time: Math.floor(Date.now() / 1000) - 5, email_verified: true, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject(opts.sub ?? 'uid-1')
      .setAudience(opts.aud ?? projectId)
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${projectId}`)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(privateKey);
  return { verify, sign };
}
