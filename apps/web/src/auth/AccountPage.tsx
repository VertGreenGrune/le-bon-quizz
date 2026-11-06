import { useEffect, useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH } from '@lbq/shared';
import { ApiError, api } from '../api';
import type { FieldErrors } from '../api/validation';
import { EditorShell, btn } from '../editor/EditorShell';
import { FormError, FormNotice, TextField } from './AuthCard';
import { useAuth } from './AuthContext';
import { newPasswordErrors } from './passwordForm';
import {
  changeFirebasePassword,
  firebaseErrorMessage,
  isFirebaseError,
  signInMethods,
} from '../lib/firebase';

const EMPTY = { currentPassword: '', newPassword: '', confirm: '' };

/** `/account` — "Mon compte": the host's details and the change-password form. */
export function AccountPage() {
  const { user, firebase } = useAuth();
  /** T46: how the Firebase user signs in (`password`, `google.com`); null = still loading. */
  const [methods, setMethods] = useState<string[] | null>(null);
  useEffect(() => {
    if (firebase) signInMethods(firebase).then(setMethods, () => setMethods([]));
  }, [firebase]);
  const canChange =
    firebase === null || (firebase !== undefined && !!methods?.includes('password'));
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    setDone(false);
    const fieldErrors = newPasswordErrors(form.newPassword, form.confirm, 'newPassword');
    if (!form.currentPassword) fieldErrors.currentPassword = 'Champ obligatoire';
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setBusy(true);
    try {
      if (firebase) {
        await changeFirebasePassword(firebase, form.currentPassword, form.newPassword);
      } else {
        await api.auth.changePassword({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        });
      }
      setForm(EMPTY);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WRONG_PASSWORD') {
        setErrors({ currentPassword: err.message });
      } else if (
        isFirebaseError(err, 'auth/invalid-credential') ||
        isFirebaseError(err, 'auth/wrong-password')
      ) {
        setErrors({ currentPassword: 'Mot de passe actuel incorrect' });
      } else setFormError(firebaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <EditorShell>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <h1 className="text-3xl font-black">Mon compte</h1>
        {user && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl bg-white p-5 shadow-sm">
            <dt className="font-semibold text-gray-500">Nom</dt>
            <dd>{user.name}</dd>
            <dt className="font-semibold text-gray-500">E-mail</dt>
            <dd className="break-all">{user.email}</dd>
          </dl>
        )}
        {firebase && methods && !canChange && (
          <p className="rounded-2xl bg-white p-5 text-gray-700 shadow-sm">
            {methods.includes('google.com')
              ? 'Vous êtes connecté avec Google : votre mot de passe se gère dans votre compte Google.'
              : 'Pour changer le mot de passe, déconnectez-vous puis reconnectez-vous.'}
          </p>
        )}
        {canChange && (
          <form
            onSubmit={onSubmit}
            noValidate
            className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-black">Changer le mot de passe</h2>
            <TextField
              label="Mot de passe actuel"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={set('currentPassword')}
              error={errors.currentPassword}
            />
            <TextField
              label="Nouveau mot de passe"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={set('newPassword')}
              error={errors.newPassword}
              hint={`${PASSWORD_MIN_LENGTH} caractères minimum`}
            />
            <TextField
              label="Confirmer le nouveau mot de passe"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={set('confirm')}
              error={errors.confirm}
            />
            {formError && <FormError>{formError}</FormError>}
            {done && (
              <FormNotice>
                {firebase
                  ? 'Mot de passe modifié ✓'
                  : 'Mot de passe modifié ✓ Vos autres appareils ont été déconnectés.'}
              </FormNotice>
            )}
            <button type="submit" disabled={busy} className={`${btn.primary} self-start`}>
              {busy ? '…' : 'Changer le mot de passe'}
            </button>
          </form>
        )}
      </main>
    </EditorShell>
  );
}
