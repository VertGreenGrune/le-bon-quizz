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
import type { LoginBody, PublicUser, RegisterBody } from '@lbq/shared';
import { ApiError, api } from '../api';

interface AuthValue {
  /** `undefined` while `/auth/me` is loading, `null` when logged out. */
  user: PublicUser | null | undefined;
  /** Set when `/auth/me` failed for another reason than 401 (e.g. server down). */
  loadError: string | null;
  login: (body: LoginBody) => Promise<void>;
  register: (body: RegisterBody) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Host session state, backed by the httpOnly `lbq_session` cookie. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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

  const login = useCallback(async (body: LoginBody) => {
    setUser((await api.auth.login(body)).user);
  }, []);
  const register = useCallback(async (body: RegisterBody) => {
    setUser((await api.auth.register(body)).user);
  }, []);
  const logout = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    setUser(null);
  }, []);
  const reload = useCallback(() => {
    setLoadError(null);
    setUser(undefined);
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ user, loadError, login, register, logout, reload }),
    [user, loadError, login, register, logout, reload],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Layout route for `/login`, `/register` and `/editor/**`. */
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
