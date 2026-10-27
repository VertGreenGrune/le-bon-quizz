import '@fontsource/orbitron/latin-700.css';
import type { ThemeDefinition } from './types';

/** Deep space: twinkling stars, a slow planet, a shooting star now and then; synth pad. */
export const space: ThemeDefinition = {
  id: 'space',
  name: 'Espace',
  icon: '🚀',
  colors: {
    brand: '#1b1f5e',
    bg: 'radial-gradient(ellipse 60% 50% at 18% 12%, rgb(64 72 180 / 0.45), transparent 70%), radial-gradient(ellipse 50% 45% at 85% 85%, rgb(110 40 150 / 0.4), transparent 70%), #070a24',
    panel: 'rgb(255 255 255 / 0.09)',
    accent: '#7dd3fc',
    text: '#ffffff',
    timer: '#7dd3fc',
  },
  font: "'Orbitron', ui-sans-serif, system-ui, sans-serif",
  confetti: {
    colors: ['#ffffff', '#7dd3fc', '#c4b5fd', '#fde68a'],
    shapes: ['circle', 'rect'],
    emojis: ['⭐', '✨', '🪐'],
    emojiShare: 0.3,
  },
  sounds: { lobby: 'lobby-space', reveal: 'reveal-space', podium: 'podium-space' },
  lobbyTitle: { text: 'Mission Quizz', left: '🚀', right: '🪐' },
};
