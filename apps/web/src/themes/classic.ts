import type { ThemeDefinition } from './types';

/** Today's look: plain purple, system font, multicolor confetti, the original sounds. */
export const classic: ThemeDefinition = {
  id: 'classic',
  name: 'Classique',
  icon: '🎉',
  colors: {
    brand: '#46178f',
    bg: '#46178f',
    panel: 'rgb(0 0 0 / 0.25)',
    accent: '#fbbf24',
    text: '#ffffff',
    timer: '#ffffff',
  },
  font: 'ui-sans-serif, system-ui, sans-serif',
  confetti: {
    colors: ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#ffffff', '#fbbf24'],
    shapes: ['rect', 'rect', 'circle'],
    emojis: [],
    emojiShare: 0,
  },
  sounds: {},
  lobbyTitle: null,
};
