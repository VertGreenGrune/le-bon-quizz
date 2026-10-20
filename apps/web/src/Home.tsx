import { Link } from 'react-router';
import { SHAPES } from '@lbq/shared';
import { ShapeIcon, shapeBg } from './components/shapes';

export function Home() {
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
        <Link
          to="/host/new"
          className="rounded-lg border-2 border-white py-3 text-center font-bold"
        >
          Animer une partie (démo)
        </Link>
      </div>
    </main>
  );
}
