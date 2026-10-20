import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { NICKNAME_MAX_LENGTH, Nickname, PIN_LENGTH, Pin } from '@lbq/shared';
import { errorMessage, normalizePin } from './playerState';
import { joinGame } from './playerStore';
import { loadSession } from './session';

/** /join?pin=123456 — phone join screen (the host QR code points here). */
export function JoinPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const pinFromUrl = normalizePin(params.get('pin') ?? '', PIN_LENGTH);
  const [pin, setPin] = useState(pinFromUrl);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = loadSession();

  const pinValid = Pin.safeParse(pin).success;
  const nicknameValid = Nickname.safeParse(nickname).success;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pinValid || !nicknameValid || busy) return;
    setBusy(true);
    setError(null);
    const res = await joinGame(pin, nickname.trim());
    setBusy(false);
    if (res.ok) navigate('/play', { replace: true });
    else setError(errorMessage(res.code));
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-brand px-4 py-8 text-white">
      <Link to="/" className="text-4xl font-black tracking-tight">
        Le Bon Quizz
      </Link>

      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-5 text-gray-900 shadow-xl"
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-600">Code PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(normalizePin(e.target.value, PIN_LENGTH))}
            inputMode="numeric"
            autoComplete="off"
            pattern="\d*"
            placeholder="123456"
            autoFocus={!pinFromUrl}
            className="rounded-lg border-2 border-gray-300 px-3 py-3 text-center text-3xl font-black tracking-[0.3em] outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-bold text-gray-600">Pseudo</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={NICKNAME_MAX_LENGTH}
            autoComplete="nickname"
            autoCapitalize="words"
            enterKeyHint="go"
            placeholder="Ton pseudo"
            autoFocus={!!pinFromUrl}
            className="rounded-lg border-2 border-gray-300 px-3 py-3 text-center text-2xl font-bold outline-none focus:border-brand"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-answer-red/10 px-3 py-2 text-center font-bold text-answer-red"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!pinValid || !nicknameValid || busy}
          className="touch-manipulation rounded-lg bg-gray-900 py-4 text-xl font-black text-white transition active:scale-95 disabled:opacity-40"
        >
          {busy ? 'Connexion…' : 'Entrer'}
        </button>
      </form>

      {existing && (
        <Link to="/play" className="font-bold underline underline-offset-4">
          Reprendre la partie {existing.pin} ({existing.nickname})
        </Link>
      )}
    </main>
  );
}
