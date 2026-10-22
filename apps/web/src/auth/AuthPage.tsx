import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { LoginBody, PASSWORD_MIN_LENGTH, RegisterBody } from '@lbq/shared';
import { ApiError } from '../api';
import { validate, type FieldErrors } from '../api/validation';
import { AuthCard, FormError, TextField, submitBtn } from './AuthCard';
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
  const email = form.email.trim();

  return (
    <AuthCard title={isRegister ? 'Créer un compte' : 'Connexion'} onSubmit={onSubmit}>
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
      <button type="submit" disabled={busy} className={submitBtn}>
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
