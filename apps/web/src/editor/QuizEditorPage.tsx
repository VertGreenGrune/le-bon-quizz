import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, api } from '../api';
import type { FieldErrors } from '../api/validation';
import { EditorShell, btn } from './EditorShell';
import { QuestionEditor } from './QuestionEditor';
import { ImageField } from './ImageField';
import { VisibilityField } from './visibility';
import { ShareDialog } from './ShareDialog';
import type { QuizAccess } from '@lbq/shared';
import { ThemeField } from '../themes/ThemePicker';
import { StartGameDialog } from '../components/StartGameDialog';
import { SOLO, hostUrl, type GameOptions } from '../lib/gameOptions';
import {
  addQuestion,
  emptyQuiz,
  fromDetail,
  questionErrorCount,
  validateDraft,
  type DraftQuestion,
  type QuizDraft,
  hasMedia,
} from './draft';

/** What the server told us about the loaded quiz (T45): who may do what, and its version. */
type Meta = { access: QuizAccess; ownerName: string; updatedAt: string | null };
const NEW_META: Meta = { access: 'owner', ownerName: '', updatedAt: null };

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

/** `/editor/new` and `/editor/:quizId`. */
export function QuizEditorPage() {
  const { quizId: param = 'new' } = useParams();
  const navigate = useNavigate();
  /** Id of the quiz being edited (null until a new quiz is first saved). */
  const [quizId, setQuizId] = useState<string | null>(param === 'new' ? null : param);
  const [load, setLoad] = useState<Load>(
    param === 'new' ? { status: 'ready' } : { status: 'loading' },
  );
  const [draft, setDraft] = useState<QuizDraft>(emptyQuiz);
  const [saved, setSaved] = useState<string>(() => JSON.stringify(emptyQuiz()));
  const [current, setCurrent] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  /** "Lancer la partie" clicked: the Solo / Équipes dialog is open. */
  const [starting, setStarting] = useState(false);
  const [meta, setMeta] = useState<Meta>(NEW_META);
  const [sharing, setSharing] = useState(false);
  const [copying, setCopying] = useState(false);
  /** The server refused a save because someone else saved in between (409 QUIZ_CONFLICT). */
  const [conflict, setConflict] = useState(false);
  const loadedId = useRef<string | null>(quizId);

  // Load on mount and when the URL changes to another quiz (not after our own create → navigate).
  useEffect(() => {
    if (param === 'new' || (param === loadedId.current && load.status !== 'loading')) return;
    loadedId.current = param;
    let cancelled = false;
    setLoad({ status: 'loading' });
    api.quizzes.get(param).then(
      (quiz) => {
        if (cancelled) return;
        const d = fromDetail(quiz);
        setMeta({ access: quiz.access, ownerName: quiz.ownerName, updatedAt: quiz.updatedAt });
        setConflict(false);
        setQuizId(quiz.id);
        setDraft(d);
        setSaved(JSON.stringify(d));
        setCurrent(0);
        setErrors({});
        setLoad({ status: 'ready' });
      },
      (err: Error) => {
        if (cancelled) return;
        const notFound = err instanceof ApiError && err.status === 404;
        setLoad({ status: 'error', message: notFound ? 'Quiz introuvable.' : err.message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [param]); // only react to the URL

  const dirty = JSON.stringify(draft) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Validates and saves; resolves to the quiz id, or null if invalid / failed. */
  async function save(): Promise<string | null> {
    setBanner(null);
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      const firstBad = draft.questions.findIndex(
        (_, i) => questionErrorCount(result.errors, i) > 0,
      );
      if (firstBad >= 0) setCurrent(firstBad);
      setBanner({
        kind: 'error',
        text: 'Le quiz contient des erreurs, corrige les champs en rouge.',
      });
      return null;
    }
    setErrors({});
    setSaving(true);
    try {
      const quiz = quizId
        ? await api.quizzes.update(quizId, {
            ...result.data,
            ...(meta.updatedAt ? { expectedUpdatedAt: meta.updatedAt } : {}),
          })
        : await api.quizzes.create(result.data);
      const d = fromDetail(quiz);
      setMeta({ access: quiz.access, ownerName: quiz.ownerName, updatedAt: quiz.updatedAt });
      setConflict(false);
      setDraft(d);
      setSaved(JSON.stringify(d));
      if (!quizId) {
        loadedId.current = quiz.id;
        setQuizId(quiz.id);
        navigate(`/editor/${quiz.id}`, { replace: true });
      }
      setBanner({ kind: 'ok', text: 'Quiz enregistré.' });
      return quiz.id;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'QUIZ_CONFLICT') setConflict(true);
      setBanner({ kind: 'error', text: (err as Error).message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function startGame(options: GameOptions) {
    setStarting(false);
    const id = canEdit && (dirty || !quizId) ? await save() : quizId;
    if (id) navigate(hostUrl(id, options));
  }

  /**
   * « 🧪 Tester » (T66): saves, then opens a test game (the whole quiz, or one question) in a new
   * tab — never saved in the history. The tab is opened before saving so popup blockers allow it.
   */
  async function test(question?: number) {
    const tab = window.open('', '_blank');
    const id = canEdit && (dirty || !quizId) ? await save() : quizId;
    const url =
      id && hostUrl(id, { ...SOLO, test: true, ...(question !== undefined && { question }) });
    if (!url) tab?.close();
    else if (tab) tab.location.href = url;
    else navigate(url);
  }

  /** Conflict: drop the local changes and load the version saved by the other host. */
  async function reload() {
    if (!quizId) return;
    try {
      const quiz = await api.quizzes.get(quizId);
      const d = fromDetail(quiz);
      setMeta({ access: quiz.access, ownerName: quiz.ownerName, updatedAt: quiz.updatedAt });
      setDraft(d);
      setSaved(JSON.stringify(d));
      setErrors({});
      setConflict(false);
      setBanner({ kind: 'ok', text: 'Dernière version chargée.' });
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message });
    }
  }

  /** Viewer: « Copier dans mes quiz » → an editable private copy. */
  async function copy() {
    if (!quizId) return;
    setCopying(true);
    try {
      const quiz = await api.quizzes.duplicate(quizId);
      navigate(`/editor/${quiz.id}`);
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message });
    } finally {
      setCopying(false);
    }
  }

  if (load.status !== 'ready') {
    return (
      <EditorShell>
        <main className="p-8 text-center">
          {load.status === 'loading' ? (
            <p className="text-gray-500">Chargement…</p>
          ) : (
            <>
              <p className="mb-4 text-lg font-semibold text-answer-red">{load.message}</p>
              <Link to="/editor" className={btn.secondary}>
                Retour à mes quiz
              </Link>
            </>
          )}
        </main>
      </EditorShell>
    );
  }

  const canEdit = meta.access !== 'viewer';
  const isOwner = meta.access === 'owner';
  const question = draft.questions[current] ?? draft.questions[0]!;
  const index = draft.questions[current] ? current : 0;
  const setQuestion = (q: DraftQuestion) =>
    setDraft((d) => ({ ...d, questions: d.questions.map((x, i) => (i === index ? q : x)) }));

  return (
    <EditorShell
      actions={
        <>
          {isOwner && quizId && (
            <button type="button" className={btn.secondary} onClick={() => setSharing(true)}>
              👥 Partager
            </button>
          )}
          {canEdit ? (
            <button
              type="button"
              className={btn.secondary}
              onClick={save}
              disabled={saving || (!dirty && !!quizId)}
            >
              {saving ? 'Enregistrement…' : dirty || !quizId ? 'Enregistrer' : 'Enregistré ✓'}
            </button>
          ) : (
            <button type="button" className={btn.secondary} onClick={copy} disabled={copying}>
              {copying ? 'Copie…' : 'Copier dans mes quiz'}
            </button>
          )}
          <button
            type="button"
            className={btn.secondary}
            onClick={() => test()}
            disabled={saving}
            title="Jouer le quiz en test sur ce PC et ton téléphone (rien n’est enregistré)"
          >
            🧪 Tester
          </button>
          <button
            type="button"
            className={btn.start}
            onClick={() => setStarting(true)}
            disabled={saving}
          >
            ▶ Lancer<span className="max-sm:hidden"> la partie</span>
          </button>
        </>
      }
    >
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Link
            to="/editor"
            className={btn.ghost}
            onClick={(e) => {
              if (dirty && !confirm('Quitter sans enregistrer les modifications ?'))
                e.preventDefault();
            }}
          >
            ← Mes quiz
          </Link>
          {banner && (
            <p
              role={banner.kind === 'error' ? 'alert' : 'status'}
              className={`flex-1 rounded-lg px-4 py-2 font-semibold ${banner.kind === 'error' ? 'bg-red-50 text-answer-red' : 'bg-green-50 text-answer-green'}`}
            >
              {banner.text}
              {conflict && (
                <button type="button" className={`${btn.secondary} ml-3`} onClick={reload}>
                  ↻ Charger la dernière version
                </button>
              )}
            </p>
          )}
        </div>

        {!isOwner && (
          <p
            data-testid="shared-access"
            className="rounded-xl bg-indigo-50 px-4 py-3 font-semibold text-indigo-900"
          >
            👥 Quiz de {meta.ownerName} partagé avec vous ·{' '}
            {meta.access === 'editor'
              ? 'vous pouvez le modifier et le lancer (seul son auteur gère la visibilité et le partage).'
              : 'vous pouvez le lancer ou en faire une copie, pas le modifier.'}
          </p>
        )}

        <fieldset disabled={!canEdit} className="contents">
          <section className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-bold text-gray-600">Titre du quiz</span>
                <input
                  value={draft.title}
                  maxLength={95}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Ex. : Culture générale"
                  aria-invalid={!!errors.title}
                  className={`rounded-lg border-2 px-3 py-2 text-xl font-bold outline-none focus:border-brand ${errors.title ? 'border-answer-red' : 'border-gray-300'}`}
                />
                {errors.title && (
                  <span className="text-sm font-semibold text-answer-red">{errors.title}</span>
                )}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-bold text-gray-600">Description (facultative)</span>
                <textarea
                  value={draft.description ?? ''}
                  maxLength={500}
                  rows={2}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  className="resize-y rounded-lg border-2 border-gray-300 px-3 py-2 outline-none focus:border-brand"
                />
                {errors.description && (
                  <span className="text-sm font-semibold text-answer-red">
                    {errors.description}
                  </span>
                )}
              </label>
              {isOwner && (
                <VisibilityField
                  value={draft.visibility ?? 'PRIVATE'}
                  onChange={(visibility) => setDraft((d) => ({ ...d, visibility }))}
                  hasMedia={hasMedia(draft)}
                />
              )}
              <ThemeField
                value={draft.theme ?? 'classic'}
                onChange={(theme) => setDraft((d) => ({ ...d, theme }))}
              />
            </div>
            <ImageField
              label="Image de couverture"
              value={draft.coverImageUrl}
              onChange={(coverImageUrl) => setDraft((d) => ({ ...d, coverImageUrl }))}
            />
          </section>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label="Questions" className="flex min-w-0 flex-col gap-2">
              {errors.questions && (
                <p className="text-sm font-semibold text-answer-red">{errors.questions}</p>
              )}
              <ol className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
                {draft.questions.map((q, i) => {
                  const errCount = questionErrorCount(errors, i);
                  return (
                    <li key={i} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setCurrent(i)}
                        aria-current={i === index}
                        className={`flex w-36 items-center gap-2 rounded-xl border-2 bg-white px-3 py-2 text-left shadow-sm md:w-full ${i === index ? 'border-brand' : 'border-transparent hover:border-gray-300'}`}
                      >
                        <span className="text-sm font-black text-gray-400">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {q.text.trim() || (
                            <span className="text-gray-400 italic">Sans titre</span>
                          )}
                        </span>
                        {errCount > 0 && (
                          <span
                            title={`${errCount} erreur(s)`}
                            className="rounded-full bg-answer-red px-1.5 text-xs font-bold text-white"
                          >
                            !
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                className={btn.secondary}
                disabled={draft.questions.length >= 100}
                onClick={() => {
                  setDraft((d) => addQuestion(d, index));
                  setCurrent(index + 1);
                }}
              >
                + Ajouter une question
              </button>
            </nav>

            <QuestionEditor
              key={index}
              index={index}
              total={draft.questions.length}
              question={question}
              errors={errors}
              onChange={setQuestion}
              onTest={() => test(index)}
              onDraftChange={(fn, nextIndex) => {
                setDraft(fn);
                setCurrent(nextIndex);
                setErrors({});
              }}
            />
          </div>
        </fieldset>
      </main>
      {sharing && quizId && <ShareDialog quizId={quizId} onClose={() => setSharing(false)} />}
      {starting && (
        <StartGameDialog
          quizTheme={draft.theme ?? 'classic'}
          onStart={startGame}
          onClose={() => setStarting(false)}
        />
      )}
    </EditorShell>
  );
}
