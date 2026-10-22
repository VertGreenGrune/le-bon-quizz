import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ForgotPasswordBody } from '@lbq/shared';
import { api } from '../api';
import { validate, type FieldErrors } from '../api/validation';
import { AuthCard, FormError, FormNotice, TextField, submitBtn } from './AuthCard';

/** `/forgot-password`: asks for a reset link. Same answer whether the account exists or not. */
export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const body = validate(ForgotPasswordBody, { email });
    if (!body.ok) {
      setErrors(body.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.auth.forgotPassword(body.data);
      setSent(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Mot de passe oublié" onSubmit={onSubmit}>
      {sent ? (
        <>
          <FormNotice>
            Si un compte existe pour cette adresse, vous allez recevoir un e-mail avec un lien pour
            choisir un nouveau mot de passe.
          </FormNotice>
          <p className="text-sm text-gray-600">
            Le lien est valable 1 heure. Pensez à regarder dans les courriers indésirables.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Indiquez l’adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un
            nouveau mot de passe.
          </p>
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          {formError && <FormError>{formError}</FormError>}
          <button type="submit" disabled={busy} className={submitBtn}>
            {busy ? '…' : 'Recevoir le lien'}
          </button>
        </>
      )}
      <p className="text-center text-sm text-gray-600">
        <Link to="/login" className="font-bold text-brand underline">
          Retour à la connexion
        </Link>
      </p>
    </AuthCard>
  );
}
