import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type {
  FirebaseWebConfig,
  LoginBody,
  PublicUser,
  RegisterBody,
  ResetPasswordBody,
} from '@lbq/shared';
import { ApiError, api } from '../api';
import {
  emailRegister,
  emailSignIn,
  firebaseErrorMessage,
  firebaseSignOut,
  googleSignIn,
  sendVerification,
} from '../lib/firebase';
import { reconnectSocket } from '../lib/socket';

interface AuthValue {
  /** `undefined` while `/auth/me` is loading, `null` when logged out. */
  user: PublicUser | null | undefined;
  /** Set when `/auth/me` failed for another reason than 401 (e.g. server down). */
  loadError: string | null;
  /**
   * T46: the Firebase web config when the server uses Firebase Auth, `null` for local accounts,
   * `undefined` while `/auth/config` is loading.
   */
  firebase: FirebaseWebConfig | null | undefined;
  /** E-mail + password: through Firebase when it is on, else the local account. */
  login: (body: LoginBody) => Promise<void>;
  register: (body: RegisterBody) => Promise<void>;
  /** New password from an e-mailed link; logs the host in. */
  resetPassword: (body: ResetPasswordBody) => Promise<void>;
  /** « Continuer avec Google » (Firebase only). */
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  reload: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Host session state, backed by the httpOnly `lbq_session` cookie. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [firebase, setFirebase] = useState<FirebaseWebConfig | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api.auth.config().then(
      (c) => !cancelled && setFirebase(c.firebase ?? null),
      () => !cancelled && setFirebase(null),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    api.auth.me().then(
      (u) => !cancelled && setUser(u),
      (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) setUser(null);
        else setLoadError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /** Firebase sign-in → ID token → our session. Errors come out as French messages. */
  const withFirebase = useCallback(
    async (getToken: (config: FirebaseWebConfig) => Promise<string>, name?: string) => {
      if (!firebase) throw new Error('Connexion Firebase indisponible');
      let idToken: string;
      try {
        idToken = await getToken(firebase);
      } catch (err) {
        throw new Error(firebaseErrorMessage(err));
      }
      try {
        setUser((await api.auth.firebase({ idToken, ...(name ? { name } : {}) })).user);
        reconnectSocket();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
          // An older account has this e-mail: prove it's yours first (link sent by Firebase).
          await sendVerification(firebase).catch(() => {});
          await firebaseSignOut(firebase).catch(() => {});
          throw new Error(
            'Un compte existe déjà avec cette adresse. Nous venons de vous envoyer un e-mail de confirmation : cliquez sur le lien, puis reconnectez-vous ici.',
          );
        }
        await firebaseSignOut(firebase).catch(() => {});
        throw err;
      }
    },
    [firebase],
  );

  const login = useCallback(
    async (body: LoginBody) => {
      if (firebase) return withFirebase((c) => emailSignIn(c, body.email, body.password));
      setUser((await api.auth.login(body)).user);
      reconnectSocket();
    },
    [firebase, withFirebase],
  );
  const register = useCallback(
    async (body: RegisterBody) => {
      if (firebase) {
        return withFirebase(
          (c) => emailRegister(c, body.email, body.password, body.name),
          body.name,
        );
      }
      setUser((await api.auth.register(body)).user);
      reconnectSocket();
    },
    [firebase, withFirebase],
  );
  const loginWithGoogle = useCallback(() => withFirebase(googleSignIn), [withFirebase]);
  const resetPassword = useCallback(async (body: ResetPasswordBody) => {
    setUser((await api.auth.resetPassword(body)).user);
    reconnectSocket();
  }, []);
  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    if (firebase) await firebaseSignOut(firebase).catch(() => {});
    setUser(null);
    reconnectSocket();
  }, [firebase]);
  const reload = useCallback(() => {
    setLoadError(null);
    setUser(undefined);
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loadError,
      firebase,
      login,
      register,
      loginWithGoogle,
      resetPassword,
      logout,
      reload,
    }),
    [user, loadError, firebase, login, register, loginWithGoogle, resetPassword, logout, reload],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Layout route for `/login`, `/register`, the password pages and `/editor/**`. */
export function AuthLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/** Renders its children only for a logged-in host; otherwise redirects to `/login?next=…`. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loadError, reload } = useAuth();
  const location = useLocation();

  if (loadError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-gray-100 p-8 text-center text-gray-900">
        <h1 className="text-2xl font-black">Serveur injoignable</h1>
        <p className="text-gray-600">{loadError}</p>
        <button
          type="button"
          onClick={reload}
          className="rounded-lg bg-brand px-6 py-3 font-bold text-white"
        >
          Réessayer
        </button>
      </main>
    );
  }
  if (user === undefined) {
    return <main className="min-h-dvh bg-gray-100 p-8 text-center text-gray-500">Chargement…</main>;
  }
  if (user === null) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return children;
}
