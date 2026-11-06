import { describe, expect, it } from 'vitest';
import { firebaseErrorMessage, isFirebaseError } from './firebase';

describe('Firebase errors', () => {
  it('translates the Firebase codes, keeps other messages', () => {
    expect(firebaseErrorMessage({ code: 'auth/invalid-credential' })).toBe(
      'E-mail ou mot de passe incorrect',
    );
    expect(firebaseErrorMessage({ code: 'auth/popup-closed-by-user' })).toBe('Connexion annulée');
    expect(firebaseErrorMessage(new Error('Serveur injoignable'))).toBe('Serveur injoignable');
    expect(firebaseErrorMessage('?')).toBe('Erreur inattendue');
  });

  it('tells Firebase errors apart', () => {
    expect(isFirebaseError({ code: 'auth/user-not-found' })).toBe(true);
    expect(isFirebaseError({ code: 'auth/user-not-found' }, 'auth/user-not-found')).toBe(true);
    expect(isFirebaseError({ code: 'auth/user-not-found' }, 'auth/weak-password')).toBe(false);
    expect(isFirebaseError({ code: 'EMAIL_NOT_VERIFIED' })).toBe(false);
    expect(isFirebaseError(null)).toBe(false);
  });
});
