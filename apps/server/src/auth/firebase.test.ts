import { beforeAll, describe, expect, it } from 'vitest';
import { firebaseConfigFromEnv, type FirebaseVerifier } from './firebase.js';
import { fakeFirebase } from './firebaseTesting.js';

describe('createFirebaseVerifier', () => {
  let verify: FirebaseVerifier;
  let sign: Awaited<ReturnType<typeof fakeFirebase>>['sign'];
  beforeAll(async () => ({ verify, sign } = await fakeFirebase()));

  it('accepts a valid token and lowercases the e-mail', async () => {
    const token = await sign({ email: ' Alice@Test.FR ', name: 'Alice' });
    await expect(verify(token)).resolves.toEqual({
      uid: 'uid-1',
      email: 'alice@test.fr',
      emailVerified: true,
      name: 'Alice',
    });
  });

  it('reports an unverified e-mail', async () => {
    const token = await sign({ email: 'a@test.fr', email_verified: false });
    expect((await verify(token)).emailVerified).toBe(false);
  });

  it('refuses another project, another issuer, an expired token, no e-mail, a future auth_time', async () => {
    const email = 'a@test.fr';
    await expect(verify(await sign({ email }, { aud: 'other' }))).rejects.toThrow();
    await expect(verify(await sign({ email }, { iss: 'https://evil.test' }))).rejects.toThrow();
    await expect(verify(await sign({ email }, { exp: '-1h' }))).rejects.toThrow();
    await expect(verify(await sign({}))).rejects.toThrow();
    const future = Math.floor(Date.now() / 1000) + 3600;
    await expect(verify(await sign({ email, auth_time: future }))).rejects.toThrow();
  });

  it('refuses a token signed by another key', async () => {
    const other = await fakeFirebase();
    await expect(verify(await other.sign({ email: 'a@test.fr' }))).rejects.toThrow();
  });
});

describe('firebaseConfigFromEnv', () => {
  it('is off without variables, needs both, defaults the auth domain', () => {
    expect(firebaseConfigFromEnv({})).toBeUndefined();
    expect(() => firebaseConfigFromEnv({ FIREBASE_PROJECT_ID: 'p' })).toThrow();
    expect(firebaseConfigFromEnv({ FIREBASE_PROJECT_ID: 'p', FIREBASE_API_KEY: 'k' })).toEqual({
      projectId: 'p',
      apiKey: 'k',
      authDomain: 'p.firebaseapp.com',
    });
    expect(
      firebaseConfigFromEnv({
        FIREBASE_PROJECT_ID: 'p',
        FIREBASE_API_KEY: 'k',
        FIREBASE_AUTH_DOMAIN: 'login.example.fr',
        FIREBASE_APP_ID: '1:2:web:3',
      }),
    ).toMatchObject({ authDomain: 'login.example.fr', appId: '1:2:web:3' });
  });
});
