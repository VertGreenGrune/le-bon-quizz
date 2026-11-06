import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { LoginBody, PASSWORD_MIN_LENGTH, RegisterBody } from '@lbq/shared';
import { validate, type FieldErrors } from '../api/validation';
import { AuthCard, FormError, TextField, submitBtn } from './AuthCard';
import { useAuth } from './AuthContext';
import { safeNext } from './safeNext';

/** `/login` and `/register` (host accounts; players never log in). */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register, loginWithGoogle, firebase } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  if (user) return <Navigate to={next} replace />;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      navigate(next, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  }

  function onGoogle() {
    if (busy) return;
    setFormError(null);
    void run(loginWithGoogle);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || firebase === undefined) return;
    setFormError(null);
    const body = isRegister
      ? validate(RegisterBody, form)
      : validate(LoginBody, { email: form.email, password: form.password });
    if (!body.ok) {
      setErrors(body.errors);
      return;
    }
    setErrors({});
    const data = body.data;
    await run(() => (isRegister ? register(data as RegisterBody) : login(data)));
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const otherLink = `${isRegister ? '/login' : '/register'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`;
  const email = form.email.trim();

  return (
    <AuthCard title={isRegister ? 'Créer un compte' : 'Connexion'} onSubmit={onSubmit}>
      {firebase && (
        <>
          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            className="flex items-center justify-center gap-3 rounded-lg border-2 border-gray-300 bg-white px-4 py-3 font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
          >
            <GoogleLogo />
            Continuer avec Google
          </button>
          <p className="flex items-center gap-3 text-sm text-gray-500 before:h-px before:flex-1 before:bg-gray-300 after:h-px after:flex-1 after:bg-gray-300">
            ou avec votre e-mail
          </p>
        </>
      )}
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
      {!isRegister && (
        <Link
          to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
          className="-mt-2 self-end text-sm font-semibold text-brand underline"
        >
          Mot de passe oublié ?
        </Link>
      )}
      {formError && <FormError>{formError}</FormError>}
      <button type="submit" disabled={busy || firebase === undefined} className={submitBtn}>
        {busy ? '…' : isRegister ? 'Créer mon compte' : 'Se connecter'}
      </button>
      <p className="text-center text-sm text-gray-600">
        {isRegister ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
        <Link to={otherLink} className="font-bold text-brand underline">
          {isRegister ? 'Se connecter' : 'Créer un compte'}
        </Link>
      </p>
    </AuthCard>
  );
}

/** Google's « G » (brand colors, as Google's sign-in guidelines ask). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
