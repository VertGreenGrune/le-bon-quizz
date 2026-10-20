import { useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { LoginBody, PASSWORD_MIN_LENGTH, RegisterBody } from '@lbq/shared';
import { ApiError } from '../api';
import { validate, type FieldErrors } from '../api/validation';
import { useAuth } from './AuthContext';
import { safeNext } from './safeNext';

/** `/login` and `/register` (host accounts; players never log in). */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  if (user) return <Navigate to={next} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const body = isRegister
      ? validate(RegisterBody, form)
      : validate(LoginBody, { email: form.email, password: form.password });
    if (!body.ok) {
      setErrors(body.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (isRegister) await register(body.data as RegisterBody);
      else await login(body.data);
      navigate(next, { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const otherLink = `${isRegister ? '/login' : '/register'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-brand px-4 py-8 text-white">
      <Link to="/" className="text-4xl font-black tracking-tight">
        Le Bon Quizz
      </Link>
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 text-gray-900 shadow-xl"
      >
        <h1 className="text-2xl font-black">{isRegister ? 'Créer un compte' : 'Connexion'}</h1>
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
        />
        {isRegister && (
          <TextField
            label="Nom"
            autoComplete="name"
            value={form.name}
            onChange={set('name')}
            error={errors.name}
          />
        )}
        <TextField
          label="Mot de passe"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          hint={isRegister ? `${PASSWORD_MIN_LENGTH} caractères minimum` : undefined}
        />
        {formError && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-answer-red"
          >
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand py-3 text-lg font-bold text-white disabled:opacity-50"
        >
          {busy ? '…' : isRegister ? 'Créer mon compte' : 'Se connecter'}
        </button>
        <p className="text-center text-sm text-gray-600">
          {isRegister ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
          <Link to={otherLink} className="font-bold text-brand underline">
            {isRegister ? 'Se connecter' : 'Créer un compte'}
          </Link>
        </p>
      </form>
    </main>
  );
}

function TextField({
  label,
  error,
  hint,
  ...input
}: {
  label: string;
  error?: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold text-gray-600">{label}</span>
      <input
        {...input}
        aria-invalid={!!error}
        className={`rounded-lg border-2 px-3 py-2 outline-none focus:border-brand ${error ? 'border-answer-red' : 'border-gray-300'}`}
      />
      {error ? (
        <span className="text-sm font-semibold text-answer-red">{error}</span>
      ) : (
        hint && <span className="text-xs text-gray-500">{hint}</span>
      )}
    </label>
  );
}
