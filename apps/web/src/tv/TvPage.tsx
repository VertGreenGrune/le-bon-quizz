import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { SHAPES, type ServerToClientEvents } from '@lbq/shared';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { markTvScreen } from '../host/castToTv';
import { saveHostToken } from '../host/useHostGame';
import { getSocket } from '../lib/socket';
import { primeWakeLock, useWakeLock } from '../player/useWakeLock';

/**
 * `/tv` (T47): opened in the browser of a Fire TV (or any TV / big screen). Shows a 4-digit
 * code; the host types it in « 📺 Afficher sur la TV » and this page becomes the host screen
 * (`tv:paired` → `/host/<PIN>`, same document so the sound unlocked here stays unlocked).
 */
export function TvPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(() => getSocket().connected);
  const [soundOn, setSoundOn] = useState(false);
  const codeRef = useRef<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  useWakeLock(true);

  useEffect(() => {
    const socket = getSocket();
    const register = () => {
      setConnected(true);
      socket.emit('tv:register', codeRef.current ? { code: codeRef.current } : {}, (res) => {
        if (!res.ok) return;
        codeRef.current = res.code;
        setCode(res.code);
      });
    };
    const onDisconnect = () => setConnected(false);
    const onPaired: ServerToClientEvents['tv:paired'] = ({ pin, hostToken }) => {
      saveHostToken(pin, hostToken);
      markTvScreen();
      navigate(`/host/${pin}`, { replace: true });
    };
    socket.on('connect', register);
    socket.on('disconnect', onDisconnect);
    socket.on('tv:paired', onPaired);
    if (socket.connected) register();
    else socket.connect();
    return () => {
      socket.off('connect', register);
      socket.off('disconnect', onDisconnect);
      socket.off('tv:paired', onPaired);
    };
  }, [navigate]);

  // The TV remote moves the focus: start on the only button.
  useEffect(() => button.current?.focus(), []);

  const enableSound = () => {
    // A key press / click on this page unlocks the sound for the whole game (same document).
    primeWakeLock();
    setSoundOn(true);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-[4vh] bg-brand p-[4vh] text-center text-white">
      <div className="flex items-center gap-[2vh]">
        <h1 className="text-[7vh] font-black tracking-tight">Le Bon Quizz</h1>
        <div className="flex gap-[1vh]">
          {SHAPES.map((s) => (
            <div key={s.index} className={`rounded-lg p-[1vh] ${shapeBg[s.color]}`}>
              <ShapeIcon shape={s.shape} className="size-[4vh] fill-white" />
            </div>
          ))}
        </div>
      </div>
      <p className="text-[4vh] font-semibold">📺 Code de la TV</p>
      <p
        data-testid="tv-code"
        className="rounded-3xl bg-white px-[6vh] py-[2vh] font-mono text-[18vh] leading-none font-black tracking-[0.15em] text-brand shadow-2xl"
      >
        {code ?? '····'}
      </p>
      <p className="max-w-[80vw] text-[3.2vh] leading-snug">
        Sur ton téléphone ou ton ordinateur, lance une partie, puis appuie sur{' '}
        <strong>« 📺 Afficher sur la TV »</strong> et tape ce code.
      </p>
      <button
        ref={button}
        type="button"
        onClick={enableSound}
        className="rounded-2xl border-4 border-white px-[4vh] py-[1.5vh] text-[3.2vh] font-black focus:bg-white focus:text-brand focus:outline-none"
      >
        {soundOn ? '🔊 Son activé' : '🔊 Activer le son (appuie sur OK)'}
      </button>
      {!connected && (
        <p role="status" className="text-[3vh] font-bold text-yellow-300">
          Connexion au serveur…
        </p>
      )}
    </main>
  );
}
