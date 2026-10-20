import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { SHAPES, type GameQuestionReport, type GameReport } from '@lbq/shared';
import { ApiError, api } from '../api';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { EditorShell, btn } from '../editor/EditorShell';
import {
  averagePercentCorrect,
  formatDuration,
  hardestFirst,
  noAnswerCount,
  percentCorrect,
} from './reportStats';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
const medals = ['🥇', '🥈', '🥉'];

/** `/reports/:gameId` — final ranking and per-question results of one game. */
export function GameReportPage() {
  const { gameId = '' } = useParams();
  const [report, setReport] = useState<GameReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setError(null);
    api.games
      .get(gameId)
      .then(setReport, (err: Error) =>
        setError(
          err instanceof ApiError && err.code === 'NOT_FOUND' ? 'Partie introuvable.' : err.message,
        ),
      );
  }, [gameId]);

  return (
    <EditorShell
      actions={
        report && (
          <a
            href={api.games.exportCsvUrl(report.id)}
            download
            className="rounded-lg bg-white px-4 py-1.5 font-bold text-brand"
          >
            ⬇ Exporter CSV
          </a>
        )
      }
    >
      <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6">
        <Link to="/reports" className="mb-2 inline-block text-sm font-semibold text-brand">
          ‹ Mes parties
        </Link>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-4 py-3 font-semibold text-answer-red"
          >
            {error}
          </p>
        )}
        {!report && !error && <p className="text-gray-500">Chargement…</p>}
        {report && <Report report={report} />}
      </main>
    </EditorShell>
  );
}

function Report({ report }: { report: GameReport }) {
  const duration = formatDuration(report);
  const average = averagePercentCorrect(report.questions);
  return (
    <>
      <h1 className="text-3xl font-black">{report.quizTitle}</h1>
      <p className="mb-6 text-gray-500">
        {dateFmt.format(new Date(report.startedAt))}
        {duration && ` · ${duration}`} · PIN {report.pin}
      </p>

      <dl className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Joueurs" value={String(report.playerCount)} />
        <Stat label="Questions" value={String(report.questions.length || '—')} />
        <Stat label="Bonnes réponses" value={average === null ? '—' : `${average} %`} />
      </dl>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-black">Classement final</h2>
        {report.results.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-gray-500 shadow-sm">Aucun joueur.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="border-b text-sm text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Rang</th>
                  <th className="px-4 py-2 font-semibold">Joueur</th>
                  <th className="px-4 py-2 text-right font-semibold">Score</th>
                  <th className="px-4 py-2 text-right font-semibold">Bonnes réponses</th>
                </tr>
              </thead>
              <tbody>
                {report.results.map((r) => (
                  <tr key={`${r.rank}-${r.nickname}`} className="border-b last:border-0">
                    <td className="px-4 py-2 font-bold">
                      {medals[r.rank - 1] ?? ''} {r.rank}
                    </td>
                    <td className="max-w-48 truncate px-4 py-2 font-semibold">{r.nickname}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.score}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.correctCount}
                      {report.questions.length > 0 && ` / ${report.questions.length}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Questions questions={report.questions} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-2xl font-black">{value}</dd>
    </div>
  );
}

function Questions({ questions }: { questions: GameQuestionReport[] }) {
  const [order, setOrder] = useState<'hardest' | 'quiz'>('hardest');
  if (questions.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-xl font-black">Questions</h2>
        <p className="rounded-2xl bg-white p-6 text-gray-500 shadow-sm">
          Le détail par question n'est pas disponible pour cette partie.
        </p>
      </section>
    );
  }
  const sorted = order === 'hardest' ? hardestFirst(questions) : questions;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-xl font-black">Questions</h2>
        <label className="text-sm text-gray-600">
          Trier :{' '}
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as 'hardest' | 'quiz')}
            className="rounded-lg border-2 border-gray-300 bg-white px-2 py-1 font-semibold"
          >
            <option value="hardest">Les plus difficiles d'abord</option>
            <option value="quiz">Ordre du quiz</option>
          </select>
        </label>
      </div>
      <ol className="flex flex-col gap-3">
        {sorted.map((q) => (
          <QuestionCard key={q.index} q={q} />
        ))}
      </ol>
    </section>
  );
}

function QuestionCard({ q }: { q: GameQuestionReport }) {
  const pct = percentCorrect(q);
  const noAnswer = noAnswerCount(q);
  const max = Math.max(1, ...q.distribution, noAnswer);
  const tone = pct >= 70 ? 'bg-answer-green' : pct >= 40 ? 'bg-answer-yellow' : 'bg-answer-red';
  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span className="rounded-lg bg-brand/10 px-2 py-1 text-sm font-bold text-brand">
          Q{q.index + 1}
        </span>
        <p className="flex-1 font-bold">{q.text}</p>
        <span className={`rounded-full px-3 py-1 text-sm font-black text-white ${tone}`}>
          {pct} %
        </span>
      </div>
      <p className="mb-3 text-sm text-gray-500">
        {q.correctCount} / {q.playerCount} joueur{q.playerCount > 1 ? 's' : ''} ont bien répondu
      </p>
      <ul className="flex flex-col gap-1.5">
        {q.choices.map((text, i) => {
          const shape = SHAPES[i]!;
          const correct = q.correctIndexes.includes(i);
          const count = q.distribution[i] ?? 0;
          return (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded ${shapeBg[shape.color]}`}
              >
                <ShapeIcon shape={shape.shape} className="size-4 fill-white" />
              </span>
              <span
                className={`w-40 shrink-0 truncate sm:w-56 ${correct ? 'font-bold' : 'text-gray-600'}`}
                title={text}
              >
                {correct && <span className="text-answer-green">✓ </span>}
                {text}
              </span>
              <Bar value={count} max={max} className={shapeBg[shape.color]} faded={!correct} />
            </li>
          );
        })}
        {noAnswer > 0 && (
          <li className="flex items-center gap-2 text-sm">
            <span className="size-7 shrink-0" />
            <span className="w-40 shrink-0 truncate text-gray-500 italic sm:w-56">
              Sans réponse
            </span>
            <Bar value={noAnswer} max={max} className="bg-gray-400" faded={false} />
          </li>
        )}
      </ul>
    </li>
  );
}

function Bar({
  value,
  max,
  className,
  faded,
}: {
  value: number;
  max: number;
  className: string;
  faded: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="h-4 min-w-0 flex-1 rounded bg-gray-100">
        <span
          className={`block h-full rounded ${className} ${faded ? 'opacity-50' : ''}`}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </span>
      <span className="w-6 text-right font-semibold tabular-nums">{value}</span>
    </span>
  );
}
