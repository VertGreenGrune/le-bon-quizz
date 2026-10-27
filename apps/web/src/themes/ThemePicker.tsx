import { QUIZ_THEMES, type QuizTheme } from '@lbq/shared';
import { THEMES, themeVars } from './index';
import './themes.css';

const ANSWER_DOTS = ['bg-answer-red', 'bg-answer-blue', 'bg-answer-yellow', 'bg-answer-green'];

/** Small live preview of a theme: its background, display font, accent and the answer colors. */
function ThemePreview({ theme }: { theme: QuizTheme }) {
  const t = THEMES[theme];
  return (
    <span
      data-theme={theme}
      style={themeVars(t)}
      className="theme-surface relative flex h-20 w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-lg"
      aria-hidden="true"
    >
      <span className="flex items-center gap-2">
        <span className="theme-bob text-2xl">{t.icon}</span>
        <span
          className={`font-display text-accent ${theme === 'retro' ? 'text-[0.55rem]' : 'text-base font-black'}`}
        >
          Quizz
        </span>
      </span>
      <span className="flex gap-1">
        {ANSWER_DOTS.map((c) => (
          <span key={c} className={`size-2.5 rounded-sm ${c}`} />
        ))}
      </span>
    </span>
  );
}

/** « Thème de la TV » picker of the quiz form (T40). */
export function ThemeField({
  value,
  onChange,
}: {
  value: QuizTheme;
  onChange: (value: QuizTheme) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span id="theme-label" className="text-sm font-bold text-gray-600">
        Thème de la TV
      </span>
      <div role="radiogroup" aria-labelledby="theme-label" className="grid grid-cols-5 gap-2">
        {QUIZ_THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={value === theme}
            onClick={() => onChange(theme)}
            className={`flex flex-col items-center gap-1 rounded-xl border-2 p-1 text-sm font-bold ${
              value === theme ? 'border-brand bg-brand/10' : 'border-gray-200 hover:border-brand/50'
            }`}
          >
            <ThemePreview theme={theme} />
            {THEMES[theme].name}
          </button>
        ))}
      </div>
      <span className="text-sm text-gray-500">
        Couleurs, décor, musique et confettis de l'écran partagé. Les couleurs des réponses ne
        changent jamais.
      </span>
    </div>
  );
}

/** « 🎃 Halloween » badge (quiz list, library); nothing for the classic look. */
export function ThemeBadge({ theme }: { theme: QuizTheme }) {
  if (theme === 'classic') return null;
  const t = THEMES[theme];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-900"
      title={`Thème de la TV : ${t.name}`}
    >
      <span aria-hidden="true">{t.icon}</span> {t.name}
    </span>
  );
}
