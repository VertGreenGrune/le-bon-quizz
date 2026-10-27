import '@fontsource/creepster/latin-400.css';
import type { ThemeDefinition } from './types';

/** Night purple with a pumpkin glow, fog, bats and flickering pumpkins; spooky organ. */
export const halloween: ThemeDefinition = {
  id: 'halloween',
  name: 'Halloween',
  icon: '🎃',
  colors: {
    brand: '#4a1361',
    bg: 'radial-gradient(ellipse 90% 45% at 50% 112%, rgb(255 122 24 / 0.5), transparent 70%), linear-gradient(180deg, #14061f 0%, #2a0c3c 60%, #3a1034 100%)',
    panel: 'rgb(12 0 22 / 0.5)',
    accent: '#ff8c1a',
    text: '#ffffff',
    timer: '#ff8c1a',
  },
  font: "'Creepster', ui-sans-serif, system-ui, sans-serif",
  confetti: {
    colors: ['#ff8c1a', '#7c3aed', '#a3e635', '#1f1029', '#ffffff'],
    shapes: ['rect', 'circle'],
    emojis: ['🎃', '🦇', '👻'],
    emojiShare: 0.35,
  },
  sounds: { lobby: 'lobby-halloween', reveal: 'reveal-halloween', podium: 'podium-halloween' },
  lobbyTitle: { text: 'Soirée frissons', left: '🎃', right: '🦇' },
};
