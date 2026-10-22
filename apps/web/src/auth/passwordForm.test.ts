import { describe, expect, it } from 'vitest';
import { ForgotPasswordBody } from '@lbq/shared';
import { validate } from '../api/validation';
import { newPasswordErrors } from './passwordForm';

describe('newPasswordErrors', () => {
  it('accepts a long enough password typed twice', () => {
    expect(newPasswordErrors('nouveau-mdp', 'nouveau-mdp')).toEqual({});
  });

  it('applies the registration rules', () => {
    expect(newPasswordErrors('court', 'court')).toEqual({ password: 'Au moins 8 caractères' });
    const long = 'x'.repeat(129);
    expect(newPasswordErrors(long, long, 'newPassword')).toEqual({
      newPassword: '128 caractères maximum',
    });
  });

  it('needs the same password twice', () => {
    expect(newPasswordErrors('nouveau-mdp', '')).toEqual({ confirm: 'Champ obligatoire' });
    expect(newPasswordErrors('nouveau-mdp', 'nouveau-mdP')).toEqual({
      confirm: 'Les deux mots de passe ne correspondent pas',
    });
  });
});

describe('forgot password form', () => {
  it('validates the e-mail with the shared schema', () => {
    expect(validate(ForgotPasswordBody, { email: 'lea.test.fr' })).toEqual({
      ok: false,
      errors: { email: 'Adresse e-mail invalide' },
    });
    expect(validate(ForgotPasswordBody, { email: ' Lea@Test.fr ' })).toEqual({
      ok: true,
      data: { email: 'lea@test.fr' },
    });
  });
});
