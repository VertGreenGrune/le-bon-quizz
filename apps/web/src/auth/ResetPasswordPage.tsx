import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { PASSWORD_MIN_LENGTH } from '@lbq/shared';
import { ApiError } from '../api';
import type { FieldErrors } from '../api/validation';
import { AuthCard, FormError, TextField, submitBtn } from './AuthCard';
import { useAuth } from './AuthContext';
import { newPasswordErrors } from './passwordForm';

/** Message shown by the editor after a successful reset (`location.state.flash`). */
export const PASSWORD_CHANGED = 'Mot de passe modifié ✓';

/** `/reset-password?token=…` (link of the e-mail): new password ×2, then logged in → `/editor`. */
export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(!token);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const fieldErrors = newPasswordErrors(form.password, form.confirm);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setBusy(true);
    try {
      await resetPassword({ token, password: form.password });
      navigate('/editor', { replace: true, state: { flash: PASSWORD_CHANGED } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RESET_TOKEN_INVALID') setInvalid(true);
      else setFormError(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <AuthCard title="Lien invalide">
        <FormError>
          Ce lien n’est plus valable : il a expiré (1 heure) ou a déjà été utilisé.
        </FormError>
        <Link to="/forgot-password" className={`${submitBtn} text-center`}>
          Demander un nouveau lien
        </Link>
        <p className="text-center text-sm text-gray-600">
          <Link to="/login" className="font-bold text-brand underline">
            Retour à la connexion
          </Link>
        </p>
      </AuthCard>
    );
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <AuthCard title="Nouveau mot de passe" onSubmit={onSubmit}>
      <TextField
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        autoFocus
        value={form.password}
        onChange={set('password')}
        error={errors.password}
        hint={`${PASSWORD_MIN_LENGTH} caractères minimum`}
      />
      <TextField
        label="Confirmer le mot de passe"
        type="password"
        autoComplete="new-password"
        value={form.confirm}
        onChange={set('confirm')}
        error={errors.confirm}
      />
      {formError && <FormError>{formError}</FormError>}
      <button type="submit" disabled={busy} className={submitBtn}>
        {busy ? '…' : 'Enregistrer et se connecter'}
      </button>
    </AuthCard>
  );
}
