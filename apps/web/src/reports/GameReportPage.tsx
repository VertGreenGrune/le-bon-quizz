import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  SHAPES,
  TEAM_NAMES,
  type GameQuestionReport,
  type GameReport,
  type GameTeamReport,
} from '@lbq/shared';
import { ApiError, api } from '../api';
import { Avatar } from '../components/Avatar';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { EditorShell, btn } from '../editor/EditorShell';
import { QUESTION_TYPES } from '../editor/draft';
import { formatValue } from '../lib/numbers';
import {
  averagePercentCorrect,
  formatDuration,
  hardestFirst,
  isScored,
  noAnswerCount,
  percentCorrect,
} from './reportStats';
import { JokersBadge, JokersUsed, ModeBadge } from './ModeBadge';
import { survivalLabel } from '../lib/survival';
import { MoreTypeDetails } from './moreTypeCards';
import { BluffDetails } from './bluffCard';
import { BuzzerDetails } from './buzzerCard';
import { DrawDetails } from './drawCard';

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
      <h1 className="flex items-center gap-3 text-3xl font-black">
        {report.quizTitle}
        <ModeBadge mode={report.mode} hearts={report.hearts} />
        {report.jokers && <JokersBadge />}
      </h1>
      <p className="mb-6 text-gray-500">
        {dateFmt.format(new Date(report.startedAt))}
        {duration && ` · ${duration}`} · PIN {report.pin}
      </p>

      <dl className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Joueurs" value={String(report.playerCount)} />
        <Stat label="Questions" value={String(report.questions.length || '—')} />
        <Stat label="Bonnes réponses" value={average === null ? '—' : `${average} %`} />
      </dl>

      {report.teams.length > 0 && <Teams teams={report.teams} />}

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-black">
          {report.teams.length > 0
            ? 'Classement des joueurs'
            : report.mode === 'survival'
              ? 'Classement des survivants'
              : 'Classement final'}
        </h2>
        {report.results.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-gray-500 shadow-sm">Aucun joueur.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="border-b text-sm text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Rang</th>
                  <th className="px-4 py-2 font-semibold">Joueur</th>
                  {report.mode === 'teams' && <th className="px-4 py-2 font-semibold">Équipe</th>}
                  {report.jokers && <th className="px-4 py-2 font-semibold">Jokers joués</th>}
                  {report.mode === 'survival' && (
                    <th className="px-4 py-2 font-semibold">Survie</th>
                  )}
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
                    <td className="px-4 py-2 font-semibold">
                      <span className="flex max-w-56 items-center gap-2">
                        {r.avatar && <Avatar id={r.avatar} size="sm" />}
                        <span className="truncate">{r.nickname}</span>
                      </span>
                    </td>
                    {report.mode === 'teams' && (
                      <td className="px-4 py-2">
                        {r.teamId !== null && (
                          <span className="flex items-center gap-1.5 text-sm font-semibold">
                            <span
                              className={`size-3 rounded-full ${shapeBg[SHAPES[r.teamId].color]}`}
                              aria-hidden="true"
                            />
                            {TEAM_NAMES[r.teamId]}
                          </span>
                        )}
                      </td>
                    )}
                    {report.jokers && (
                      <td className="px-4 py-2 text-xl">
                        <JokersUsed jokers={r.jokersUsed ?? []} />
                      </td>
                    )}
                    {report.mode === 'survival' && (
                      <td className="px-4 py-2 text-sm font-semibold" data-testid="report-survival">
                        {r.survival ? survivalLabel(r.survival) : '—'}
                      </td>
                    )}
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

function Teams({ teams }: { teams: GameTeamReport[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-xl font-black">Classement des équipes</h2>
      <p className="mb-3 text-sm text-gray-500">Score d'équipe = moyenne des points par joueur.</p>
      <ol className="flex flex-col gap-2">
        {teams.map((t) => {
          const s = SHAPES[t.teamId];
          return (
            <li
              key={t.teamId}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 font-bold text-white shadow-sm ${shapeBg[s.color]}`}
            >
              <span className="w-8 text-lg">{medals[t.rank - 1] ?? t.rank}</span>
              <ShapeIcon shape={s.shape} className="size-5 fill-white" />
              <span className="flex-1 truncate text-lg">{t.name}</span>
              <span className="text-sm opacity-90">
                {t.playerCount} joueur{t.playerCount > 1 ? 's' : ''}
              </span>
              <span className="w-20 text-right text-lg tabular-nums">{t.score}</span>
            </li>
          );
        })}
      </ol>
    </section>
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

const typeLabel = (type: GameQuestionReport['type']) =>
  QUESTION_TYPES.find((t) => t.type === type)?.label ?? type;

const MORE_TYPES: GameQuestionReport['type'][] = ['ORDER', 'PIN', 'WHO_OF_US', 'WORD_CLOUD'];

function QuestionCard({ q }: { q: GameQuestionReport }) {
  const scored = isScored(q);
  const pct = percentCorrect(q);
  const noAnswer = noAnswerCount(q);
  const tone = pct >= 70 ? 'bg-answer-green' : pct >= 40 ? 'bg-answer-yellow' : 'bg-answer-red';
  const plural = q.playerCount > 1 ? 's' : '';
  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span className="rounded-lg bg-brand/10 px-2 py-1 text-sm font-bold text-brand">
          Q{q.index + 1}
        </span>
        <p className="flex-1 font-bold">
          {q.text}
          {q.type !== 'MCQ' && q.type !== 'TRUE_FALSE' && (
            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-gray-500">
              {typeLabel(q.type)}
            </span>
          )}
          {q.details.buzzer && (
            <span className="ml-2 rounded bg-answer-yellow/20 px-1.5 py-0.5 text-xs font-bold whitespace-nowrap text-gray-700">
              🔔 Buzzer
            </span>
          )}
        </p>
        {scored && (
          <span className={`rounded-full px-3 py-1 text-sm font-black text-white ${tone}`}>
            {pct} %
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-gray-500">
        {scored
          ? `${q.correctCount} / ${q.playerCount} joueur${plural} ont ${q.type === 'BLUFF' ? 'trouvé la vérité' : q.type === 'DRAW' ? 'trouvé le mot' : 'bien répondu'}`
          : `${q.answerCount} / ${q.playerCount} joueur${plural} ont ${q.type === 'WORD_CLOUD' ? 'répondu' : 'voté'} — pas de bonne réponse`}
      </p>
      {q.details.buzzer ? (
        <BuzzerDetails q={q} />
      ) : q.type === 'BLUFF' ? (
        <BluffDetails q={q} noAnswer={noAnswer} />
      ) : q.type === 'DRAW' ? (
        <DrawDetails q={q} />
      ) : MORE_TYPES.includes(q.type) ? (
        <MoreTypeDetails q={q} noAnswer={noAnswer} />
      ) : q.type === 'TYPE_ANSWER' ? (
        <TypedAnswers q={q} noAnswer={noAnswer} />
      ) : q.type === 'SLIDER' ? (
        <SliderGuesses q={q} noAnswer={noAnswer} />
      ) : (
        <ChoiceBars q={q} noAnswer={noAnswer} />
      )}
      {q.details.multiple && (
        <p className="mt-2 text-sm font-semibold text-gray-600">
          ☑️ Plusieurs bonnes réponses : {q.details.multiple.allFound} joueur
          {q.details.multiple.allFound > 1 ? 's ont' : ' a'} tout coché juste
        </p>
      )}
      {q.explanation && (
        <p
          className="mt-3 rounded-lg bg-answer-yellow/15 px-3 py-2 text-sm whitespace-pre-line text-gray-700"
          data-testid="report-explanation"
        >
          <span className="font-bold">💡 Le saviez-vous ?</span> {q.explanation}
        </p>
      )}
    </li>
  );
}

function NoAnswerRow({ count, max }: { count: number; max: number }) {
  if (count === 0) return null;
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="size-7 shrink-0" />
      <span className="w-40 shrink-0 truncate text-gray-500 italic sm:w-56">Sans réponse</span>
      <Bar value={count} max={max} className="bg-gray-400" faded={false} />
    </li>
  );
}

type CardProps = { q: GameQuestionReport; noAnswer: number };

/** MCQ, true/false, poll: one bar per choice (polls: nothing marked right or faded). */
function ChoiceBars({ q, noAnswer }: CardProps) {
  const poll = q.type === 'POLL';
  const max = Math.max(1, ...q.distribution, noAnswer);
  return (
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
            <Bar
              value={count}
              max={max}
              className={shapeBg[shape.color]}
              faded={!poll && !correct}
            />
          </li>
        );
      })}
      <NoAnswerRow count={noAnswer} max={max} />
    </ul>
  );
}

/** Réponse libre: accepted answers, then the most typed answers. */
function TypedAnswers({ q, noAnswer }: CardProps) {
  const top = q.details.topAnswers ?? [];
  const max = Math.max(1, ...top.map((a) => a.count), noAnswer);
  return (
    <>
      <p className="mb-2 text-sm font-semibold">
        Réponses acceptées :{' '}
        <span className="text-answer-green">{(q.details.acceptedAnswers ?? []).join(' · ')}</span>
      </p>
      <ul className="flex flex-col gap-1.5">
        {top.map((a, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="size-7 shrink-0 text-center font-black text-answer-green">
              {a.correct && '✓'}
            </span>
            <span
              className={`w-40 shrink-0 truncate sm:w-56 ${a.correct ? 'font-bold' : 'text-gray-600'}`}
              title={a.text}
            >
              {a.text}
            </span>
            <Bar
              value={a.count}
              max={max}
              className={a.correct ? 'bg-answer-green' : 'bg-answer-red'}
              faded={!a.correct}
            />
          </li>
        ))}
        <NoAnswerRow count={noAnswer} max={max} />
      </ul>
    </>
  );
}

/** Curseur: the correct value and margin band on an axis, a dot per guess. */
function SliderGuesses({ q, noAnswer }: CardProps) {
  const { slider, guesses = [], closest } = q.details;
  if (!slider) return null;
  const { min, max, correct, margin, unit } = slider;
  const pos = (v: number) => `${((Math.min(Math.max(v, min), max) - min) / (max - min)) * 100}%`;
  const low = Math.max(min, correct - margin);
  const high = Math.min(max, correct + margin);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="font-semibold">
        Bonne réponse :{' '}
        <span className="text-answer-green">
          {formatValue(correct, unit)}
          {margin > 0 && ` ± ${formatValue(margin)}`}
        </span>
        {closest && (
          <>
            {' '}
            · Le plus proche :{' '}
            {closest.avatar && (
              <Avatar id={closest.avatar} size="xs" className="align-middle" />
            )}{' '}
            <b>{closest.nickname}</b> ({formatValue(closest.value, unit)})
          </>
        )}
      </p>
      <div className="relative mx-3 my-4 h-2 rounded-full bg-gray-200">
        <span
          className="absolute -inset-y-1.5 rounded bg-answer-green/40"
          style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})`, minWidth: 3 }}
        />
        <span
          className="absolute -inset-y-2.5 w-1 -translate-x-1/2 rounded bg-answer-green"
          style={{ left: pos(correct) }}
        />
        {guesses.map((g, i) => (
          <span
            key={i}
            title={formatValue(g, unit)}
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-answer-yellow"
            style={{ left: pos(g) }}
          />
        ))}
      </div>
      <p className="flex justify-between text-gray-500 tabular-nums">
        <span>{formatValue(min, unit)}</span>
        {noAnswer > 0 && <span className="italic">{noAnswer} sans réponse</span>}
        <span>{formatValue(max, unit)}</span>
      </p>
    </div>
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
