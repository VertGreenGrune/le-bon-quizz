import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';

/** Light dashboard layout shared by the editor pages (the game screens stay on brand purple). */
export function EditorShell({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh flex-col bg-gray-100 text-gray-900">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-brand px-4 py-3 text-white shadow">
        <Link to="/editor" className="text-xl font-black tracking-tight">
          Le Bon Quizz
        </Link>
        <Link
          to="/library"
          className="rounded-lg px-2 py-1 text-sm font-semibold hover:bg-white/10"
        >
          Bibliothèque
        </Link>
        <Link
          to="/reports"
          className="rounded-lg px-2 py-1 text-sm font-semibold hover:bg-white/10"
        >
          Mes parties
        </Link>
        <span className="flex-1" />
        {actions}
        {user && (
          <span className="flex items-center gap-2 text-sm">
            <span className="hidden opacity-80 sm:inline">{user.name}</span>
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
              className="rounded-lg border border-white/50 px-3 py-1 hover:bg-white/10"
            >
              Déconnexion
            </button>
          </span>
        )}
      </header>
      {children}
    </div>
  );
}

export const btn = {
  primary:
    'rounded-lg bg-brand px-4 py-2 font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50',
  secondary:
    'rounded-lg border-2 border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50',
  ghost: 'rounded-lg px-3 py-1.5 font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-40',
  danger:
    'rounded-lg px-3 py-1.5 font-semibold text-answer-red hover:bg-red-50 disabled:opacity-40',
  start:
    'rounded-lg bg-answer-green px-4 py-2 font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50',
};
