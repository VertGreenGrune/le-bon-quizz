import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { SHAPES } from '@lbq/shared';
import { ShapeIcon, shapeBg } from './components/shapes';
import { StartGameDialog } from './components/StartGameDialog';
import { hostUrl } from './lib/gameOptions';

export function Home() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-brand p-4 text-white">
      <h1 className="text-5xl font-black tracking-tight">Le Bon Quizz</h1>
      <div className="flex gap-3">
        {SHAPES.map((s) => (
          <div key={s.index} className={`rounded-lg p-3 ${shapeBg[s.color]}`}>
            <ShapeIcon shape={s.shape} className="size-8 fill-white" />
          </div>
        ))}
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link to="/join" className="rounded-lg bg-white py-3 text-center font-bold text-brand">
          Rejoindre une partie
        </Link>
        <button
          type="button"
          onClick={() => setStarting(true)}
          className="rounded-lg border-2 border-white py-3 text-center font-bold"
        >
          Animer une partie (démo)
        </button>
        <Link to="/editor" className="py-2 text-center font-semibold underline opacity-90">
          Espace animateur : mes quiz
        </Link>
        <Link to="/tv" className="py-1 text-center text-sm font-semibold underline opacity-80">
          📺 Je suis la TV : afficher un code
        </Link>
      </div>
      {starting && (
        <StartGameDialog
          onStart={(options) => navigate(hostUrl(undefined, options))}
          onClose={() => setStarting(false)}
        />
      )}
    </main>
  );
}
