import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import {
  AVATARS,
  NICKNAME_MAX_LENGTH,
  Nickname,
  PIN_LENGTH,
  Pin,
  type AvatarId,
} from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { initialAvatar } from './avatarChoice';
import { errorMessage, normalizePin, reclaimErrorMessage } from './playerState';
import { fetchJoinInfo, joinGame } from './playerStore';
import { loadSession } from './session';
import { primeWakeLock } from './useWakeLock';

/** Refresh of the "already taken" hint while the player picks an avatar. */
const TAKEN_REFRESH_MS = 4000;

/**
 * /join?pin=123456 — phone join screen (the host QR code points here). With a stored session
 * for that game (tab closed, browser restarted…) it goes straight back to /play. Once the game
 * has started, entering the nickname of a disconnected player takes their place (another phone).
 */
export function JoinPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const pinFromUrl = normalizePin(params.get('pin') ?? '', PIN_LENGTH);
  const [pin, setPin] = useState(pinFromUrl);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(() => initialAvatar());
  const [taken, setTaken] = useState<AvatarId[]>([]);
  const [started, setStarted] = useState(false);
  /** Started game: nickname waiting for the « Reprendre la partie en tant que… ? » answer. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [existing] = useState(() => loadSession());

  const pinValid = Pin.safeParse(pin).success;
  const nicknameValid = Nickname.safeParse(nickname).success;

  // Avatars already taken in this game, shown dimmed (a hint: they can still be picked).
  useEffect(() => {
    if (!pinValid) {
      setTaken([]);
      setStarted(false);
      return;
    }
    let active = true;
    const refresh = () =>
      void fetchJoinInfo(pin).then((info) => {
        if (!active) return;
        setTaken(info.taken);
        setStarted(info.started);
      });
    refresh();
    const id = setInterval(refresh, TAKEN_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [pin, pinValid]);

  async function join(name: string) {
    primeWakeLock(); // still inside the tap
    setBusy(true);
    setError(null);
    const res = await joinGame(pin, name, avatar);
    setBusy(false);
    setConfirming(null);
    if (res.ok) navigate('/play', { replace: true });
    else setError(started ? reclaimErrorMessage(res.code) : errorMessage(res.code));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pinValid || !nicknameValid || busy) return;
    if (started) setConfirming(nickname.trim());
    else void join(nickname.trim());
  }

  // Same phone, session still stored (tab closed, browser restarted…): back into the game.
  if (existing && (!pinFromUrl || existing.pin === pinFromUrl))
    return <Navigate to="/play" replace />;

  if (confirming)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-brand px-4 py-8 text-center text-white">
        <h1 className="text-3xl font-black leading-tight">
          Reprendre la partie en tant que <span className="underline">{confirming}</span> ?
        </h1>
        <p className="max-w-sm text-lg font-semibold opacity-85">
          Tu retrouves son score, son équipe et son avatar. Fais-le seulement si c'est bien toi !
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-white px-3 py-2 font-bold text-answer-red">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void join(confirming)}
          disabled={busy}
          className="w-full max-w-sm touch-manipulation rounded-lg bg-white py-4 text-xl font-black text-brand transition active:scale-95 disabled:opacity-40"
        >
          {busy ? 'Connexion…' : 'Oui, reprendre'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(null)}
          className="font-bold underline underline-offset-4"
        >
          Annuler
        </button>
      </main>
    );

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
          <span className="flex items-center gap-3">
            <Avatar id={avatar} size="lg" />
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={NICKNAME_MAX_LENGTH}
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="go"
              placeholder="Ton pseudo"
              autoFocus={!!pinFromUrl}
              className="min-w-0 flex-1 rounded-lg border-2 border-gray-300 px-3 py-3 text-center text-2xl font-bold outline-none focus:border-brand"
            />
          </span>
        </label>

        {started ? (
          <p className="rounded-lg bg-brand/10 px-3 py-2 text-center font-semibold text-gray-700">
            La partie a déjà commencé. Tu as perdu la connexion ? Entre le même pseudo pour
            reprendre ta place.
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-bold text-gray-600">Ton avatar</legend>
            <div className="grid grid-cols-5 justify-items-center gap-2">
              {AVATARS.map((a) => {
                const selected = a.id === avatar;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAvatar(a.id)}
                    aria-pressed={selected}
                    aria-label={`${a.name}${taken.includes(a.id) ? ' (déjà pris)' : ''}`}
                    title={a.name}
                    data-avatar-choice={a.id}
                    className={`touch-manipulation rounded-xl transition active:scale-90 ${
                      selected
                        ? 'scale-110 ring-4 ring-gray-900 ring-offset-2'
                        : taken.includes(a.id)
                          ? 'opacity-35'
                          : ''
                    }`}
                  >
                    <Avatar id={a.id} size="md" className="!size-14" />
                  </button>
                );
              })}
            </div>
            {taken.length > 0 && (
              <p className="text-center text-xs text-gray-500">
                Les avatars grisés sont déjà pris dans cette partie.
              </p>
            )}
          </fieldset>
        )}

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
          {busy ? 'Connexion…' : started ? 'Reprendre ma place' : 'Entrer'}
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
