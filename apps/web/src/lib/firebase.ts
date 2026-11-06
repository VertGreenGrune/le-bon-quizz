/**
 * T46 — Firebase Auth on the web. The server says whether it uses Firebase (`GET /auth/config`,
 * so the web build never needs Firebase variables). The Firebase SDK is loaded only on the host
 * pages that need it (never on the players' phones). Every sign-in ends with the ID token being
 * exchanged for our own `lbq_session` cookie (`POST /auth/firebase`), so the rest of the app is
 * unchanged.
 */
import type { Auth } from 'firebase/auth';
import type { FirebaseWebConfig } from '@lbq/shared';

let authPromise: Promise<{ auth: Auth; sdk: typeof import('firebase/auth') }> | null = null;

function firebaseAuth(config: FirebaseWebConfig) {
  authPromise ??= Promise.all([import('firebase/app'), import('firebase/auth')]).then(
    ([{ initializeApp }, sdk]) => {
      const auth = sdk.getAuth(initializeApp(config));
      auth.languageCode = 'fr';
      return { auth, sdk };
    },
  );
  return authPromise;
}

/** « Continuer avec Google » (popup); resolves with the ID token. */
export async function googleSignIn(config: FirebaseWebConfig): Promise<string> {
  const { auth, sdk } = await firebaseAuth(config);
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const { user } = await sdk.signInWithPopup(auth, provider);
  return user.getIdToken();
}

export async function emailSignIn(
  config: FirebaseWebConfig,
  email: string,
  password: string,
): Promise<string> {
  const { auth, sdk } = await firebaseAuth(config);
  const { user } = await sdk.signInWithEmailAndPassword(auth, email, password);
  return user.getIdToken();
}

/** New Firebase e-mail account: display name set, verification e-mail sent. */
export async function emailRegister(
  config: FirebaseWebConfig,
  email: string,
  password: string,
  name: string,
): Promise<string> {
  const { auth, sdk } = await firebaseAuth(config);
  const { user } = await sdk.createUserWithEmailAndPassword(auth, email, password);
  await sdk.updateProfile(user, { displayName: name });
  await sdk.sendEmailVerification(user).catch(() => {});
  return user.getIdToken();
}

/** Sends (again) the « confirmez votre adresse » e-mail to the signed-in Firebase user. */
export async function sendVerification(config: FirebaseWebConfig): Promise<void> {
  const { auth, sdk } = await firebaseAuth(config);
  if (auth.currentUser) await sdk.sendEmailVerification(auth.currentUser);
}

/** Reset link, sent by Firebase (its own e-mail and page). */
export async function sendPasswordReset(config: FirebaseWebConfig, email: string) {
  const { auth, sdk } = await firebaseAuth(config);
  await sdk.sendPasswordResetEmail(auth, email);
}

/** What signs the Firebase user in: `password` (e-mail account) and / or `google.com`. */
export async function signInMethods(config: FirebaseWebConfig): Promise<string[]> {
  const { auth } = await firebaseAuth(config);
  await auth.authStateReady();
  return auth.currentUser?.providerData.map((p) => p.providerId) ?? [];
}

/** « Changer le mot de passe » of a Firebase e-mail account (re-authenticates first). */
export async function changeFirebasePassword(
  config: FirebaseWebConfig,
  currentPassword: string,
  newPassword: string,
) {
  const { auth, sdk } = await firebaseAuth(config);
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Reconnectez-vous pour changer le mot de passe.');
  await sdk.reauthenticateWithCredential(
    user,
    sdk.EmailAuthProvider.credential(user.email, currentPassword),
  );
  await sdk.updatePassword(user, newPassword);
}

export async function firebaseSignOut(config: FirebaseWebConfig) {
  const { auth, sdk } = await firebaseAuth(config);
  await sdk.signOut(auth);
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou mot de passe incorrect',
  'auth/wrong-password': 'Mot de passe incorrect',
  'auth/user-not-found': 'E-mail ou mot de passe incorrect',
  'auth/invalid-email': 'Adresse e-mail invalide',
  'auth/email-already-in-use':
    'Un compte existe déjà avec cet e-mail : connectez-vous (ou « Mot de passe oublié ? »).',
  'auth/weak-password': 'Mot de passe trop faible',
  'auth/too-many-requests': 'Trop de tentatives, réessayez dans quelques minutes.',
  'auth/popup-closed-by-user': 'Connexion annulée',
  'auth/cancelled-popup-request': 'Connexion annulée',
  'auth/popup-blocked': 'Le navigateur a bloqué la fenêtre de connexion : autorisez les pop-ups.',
  'auth/network-request-failed': 'Connexion impossible : vérifiez votre réseau.',
  'auth/unauthorized-domain':
    'Ce site n’est pas autorisé dans Firebase (Authentication → Paramètres → Domaines autorisés).',
  'auth/operation-not-allowed': 'Cette méthode de connexion n’est pas activée dans Firebase.',
  'auth/account-exists-with-different-credential':
    'Un compte existe déjà avec cet e-mail, avec une autre méthode de connexion.',
  'auth/requires-recent-login': 'Reconnectez-vous, puis réessayez.',
  'auth/user-disabled': 'Ce compte a été désactivé.',
};

/** French message for a Firebase error (its `code`), else the error's own message. */
export function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && MESSAGES[code]) return MESSAGES[code];
  return err instanceof Error ? err.message : 'Erreur inattendue';
}

/** True for a Firebase error code (`auth/…`), as opposed to one of our API errors. */
export function isFirebaseError(err: unknown, code?: string): boolean {
  const c = (err as { code?: unknown } | null)?.code;
  return typeof c === 'string' && c.startsWith('auth/') && (!code || c === code);
}
