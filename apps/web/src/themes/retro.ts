import '@fontsource/press-start-2p/latin-400.css';
import type { ThemeDefinition } from './types';

/** 80s arcade: neon sun, moving pixel grid, scanlines; chiptune. */
export const retro: ThemeDefinition = {
  id: 'retro',
  name: 'Rétro',
  icon: '👾',
  colors: {
    brand: '#2b0a5a',
    bg: 'linear-gradient(180deg, #0d0221 0%, #1b0638 45%, #34093f 72%, #0d0221 100%)',
    panel: 'rgb(13 2 33 / 0.72)',
    accent: '#ff2fb9',
    text: '#ffffff',
    timer: '#00f0ff',
  },
  font: "'Press Start 2P', ui-monospace, monospace",
  confetti: {
    colors: ['#ff2fb9', '#00f0ff', '#fff200', '#39ff14', '#ffffff'],
    shapes: ['square'],
    emojis: [],
    emojiShare: 0,
  },
  sounds: { lobby: 'lobby-retro', reveal: 'reveal-retro', podium: 'podium-retro' },
  radio: { name: 'Underground 80s', url: 'https://ice2.somafm.com/u80s-128-mp3' },
  lobbyTitle: { text: 'LE BON QUIZZ', left: '👾', right: '🕹️' },
};
