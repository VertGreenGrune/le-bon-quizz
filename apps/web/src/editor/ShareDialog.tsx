import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { QUIZ_SHARE_ROLE_NAMES, type QuizShareInfo, type QuizShareRole } from '@lbq/shared';
import { api } from '../api';
import { btn } from './EditorShell';

const ROLES = Object.keys(QUIZ_SHARE_ROLE_NAMES) as QuizShareRole[];

const ROLE_HELP: Record<QuizShareRole, string> = {
  viewer: 'voit le quiz, le lance et peut en faire une copie',
  editor: 'peut aussi modifier les questions, le titre, la couverture et le thème',
};

function RoleSelect({
  value,
  onChange,
  label,
  disabled,
}: {
  value: QuizShareRole;
  onChange: (role: QuizShareRole) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as QuizShareRole)}
      className="rounded-lg border-2 border-gray-300 bg-white px-2 py-2 font-semibold outline-none focus:border-brand"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {QUIZ_SHARE_ROLE_NAMES[r]}
        </option>
      ))}
    </select>
  );
}

/**
 * « 👥 Partager » (T45, owner only): share the quiz with other host accounts by e-mail, change
 * their role (« Peut lancer » / « Peut modifier ») or remove them.
 */
export function ShareDialog({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const [shares, setShares] = useState<QuizShareInfo[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<QuizShareRole>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.quizzes.shares(quizId).then(setShares, (err: Error) => setError(err.message));
  }, [quizId]);
  useEffect(load, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
      load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    const ok = await run(
      () => api.quizzes.share(quizId, { email: email.trim(), role }),
      `Quiz partagé avec ${email.trim()}.`,
    );
    if (ok) setEmail('');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 text-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id="share-title" className="text-2xl font-black">
            👥 Partager le quiz
          </h2>
          <p className="text-sm text-gray-600">
            Avec un autre animateur, par l’adresse e-mail de son compte Le Bon Quizz.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="adresse@exemple.fr"
              aria-label="Adresse e-mail de l’animateur"
              className="min-w-0 flex-1 rounded-lg border-2 border-gray-300 px-3 py-2 outline-none focus:border-brand"
            />
            <RoleSelect value={role} onChange={setRole} label="Droits" />
          </div>
          <p className="text-xs text-gray-500">
            <strong>{QUIZ_SHARE_ROLE_NAMES[role]}</strong> : {ROLE_HELP[role]}.
          </p>
          <button type="submit" className={btn.primary} disabled={busy || !email.trim()}>
            Partager
          </button>
        </form>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-answer-red">
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-green-50 px-3 py-2 font-semibold text-answer-green"
          >
            {notice}
          </p>
        )}

        <section>
          <h3 className="mb-2 font-black">Personnes qui ont accès</h3>
          {shares === null && !error && <p className="text-gray-500">Chargement…</p>}
          {shares?.length === 0 && (
            <p className="text-sm text-gray-500">Ce quiz n’est partagé avec personne.</p>
          )}
          <ul className="flex flex-col gap-2">
            {shares?.map((s) => (
              <li
                key={s.user.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{s.user.name}</p>
                  <p className="truncate text-sm text-gray-500">{s.user.email}</p>
                </div>
                <RoleSelect
                  value={s.role}
                  label={`Droits de ${s.user.name}`}
                  disabled={busy}
                  onChange={(r) =>
                    run(() => api.quizzes.share(quizId, { email: s.user.email, role: r }))
                  }
                />
                <button
                  type="button"
                  className={btn.danger}
                  disabled={busy}
                  onClick={() => run(() => api.quizzes.unshare(quizId, s.user.id))}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </section>

        <button type="button" className={btn.secondary} onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
