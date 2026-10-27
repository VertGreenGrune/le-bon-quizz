import '@fontsource/mountains-of-christmas/latin-700.css';
import type { ThemeDefinition } from './types';

/** Fir green, falling snow and a garland of lights; sleigh bells. */
export const christmas: ThemeDefinition = {
  id: 'christmas',
  name: 'Noël',
  icon: '🎄',
  colors: {
    brand: '#8c1c13',
    bg: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgb(255 255 255 / 0.1), transparent 70%), linear-gradient(180deg, #0a2e22 0%, #0d3f2c 55%, #10492f 100%)',
    panel: 'rgb(0 0 0 / 0.3)',
    accent: '#f6c445',
    text: '#ffffff',
    timer: '#f6c445',
  },
  font: "'Mountains of Christmas', ui-serif, Georgia, serif",
  confetti: {
    colors: ['#ffffff', '#f6c445', '#c0392b', '#2ecc71', '#dfe9f3'],
    shapes: ['rect', 'circle', 'circle'],
    emojis: ['❄️', '⭐', '🎁'],
    emojiShare: 0.35,
  },
  sounds: { lobby: 'lobby-christmas', reveal: 'reveal-christmas', podium: 'podium-christmas' },
  lobbyTitle: { text: 'Joyeux quiz de Noël', left: '🎄', right: '🎁' },
};
