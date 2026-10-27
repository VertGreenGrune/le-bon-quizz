import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QUIZ_THEMES, QUIZ_THEME_NAMES } from '@lbq/shared';
import { soundFile } from '../host/sounds';
import { THEMES, getTheme, themeVars } from './index';

const publicDir = (path: string) => fileURLToPath(new URL(`../../public/${path}`, import.meta.url));
const CREDITS = readFileSync(publicDir('sounds/CREDITS.md'), 'utf8');

describe('TV themes registry (T40)', () => {
  it('defines every theme of the shared list, with its French name', () => {
    expect(Object.keys(THEMES)).toEqual([...QUIZ_THEMES]);
    for (const id of QUIZ_THEMES) {
      expect(THEMES[id].id).toBe(id);
      expect(THEMES[id].name).toBe(QUIZ_THEME_NAMES[id]);
      expect(THEMES[id].icon).toBeTruthy();
    }
  });

  it('sets every CSS variable, never an answer color', () => {
    for (const theme of Object.values(THEMES)) {
      const vars = themeVars(theme) as Record<string, string>;
      expect(Object.keys(vars).sort()).toEqual(
        [
          '--color-brand',
          '--theme-accent',
          '--theme-bg',
          '--theme-font',
          '--theme-panel',
          '--theme-text',
          '--theme-timer',
        ].sort(),
      );
      for (const value of Object.values(vars)) expect(value).toBeTruthy();
      expect(Object.keys(vars).some((k) => k.includes('answer'))).toBe(false);
    }
  });

  it('has confetti for every theme', () => {
    for (const { confetti } of Object.values(THEMES)) {
      expect(confetti.colors.length).toBeGreaterThan(0);
      expect(confetti.shapes.length).toBeGreaterThan(0);
      expect(confetti.emojiShare === 0 || confetti.emojis.length > 0).toBe(true);
    }
  });

  it('gives each themed look its own lobby / reveal / podium sounds, credited', () => {
    for (const theme of QUIZ_THEMES) {
      for (const name of ['lobby', 'reveal', 'podium'] as const) {
        const file = soundFile(name, theme);
        expect(file === name).toBe(theme === 'classic');
        expect(existsSync(publicDir(`sounds/${file}.wav`))).toBe(true);
        expect(CREDITS).toContain(`\`${file}.wav\``);
      }
      // Other sounds stay the classic ones.
      expect(soundFile('tick', theme)).toBe('tick');
    }
  });

  it('falls back to classic for an unknown or missing theme', () => {
    expect(getTheme('halloween').id).toBe('halloween');
    expect(getTheme('disco').id).toBe('classic');
    expect(getTheme(undefined).id).toBe('classic');
  });
});
