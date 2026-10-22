import { PASSWORD_MIN_LENGTH } from '@lbq/shared';
import type { FieldErrors } from '../api/validation';

export const PASSWORD_MAX_LENGTH = 128;

/**
 * Checks a new password typed twice (reset and "Mon compte" forms), with the registration
 * rules. Errors go to `field` (the new password) and `confirm`.
 */
export function newPasswordErrors(
  password: string,
  confirm: string,
  field = 'password',
): FieldErrors {
  const errors: FieldErrors = {};
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors[field] = `Au moins ${PASSWORD_MIN_LENGTH} caractères`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors[field] = `${PASSWORD_MAX_LENGTH} caractères maximum`;
  }
  if (!confirm) errors.confirm = 'Champ obligatoire';
  else if (confirm !== password) errors.confirm = 'Les deux mots de passe ne correspondent pas';
  return errors;
}
