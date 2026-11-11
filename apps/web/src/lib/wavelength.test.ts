import { describe, expect, it } from 'vitest';
import {
  bandsFor,
  closestNeedles,
  needleLanes,
  parseSpectrumLine,
  spectrumLine,
  wavelengthResultTitle,
} from './wavelength';

describe('« Sur la même longueur d’onde » helpers', () => {
  it('bands around the target, clamped to the scale, widest first', () => {
    expect(bandsFor(50)).toEqual([
      { from: 30, to: 70, share: 0.3 },
      { from: 38, to: 62, share: 0.6 },
      { from: 45, to: 55, share: 1 },
    ]);
    expect(bandsFor(10)[0]).toEqual({ from: 0, to: 30, share: 0.3 });
    expect(bandsFor(90)[0]).toEqual({ from: 70, to: 100, share: 0.3 });
  });

  it('editor lines', () => {
    expect(parseSpectrumLine(' Froid /Chaud ')).toEqual({ left: 'Froid', right: 'Chaud' });
    expect(parseSpectrumLine('Bien / mal / autre')).toEqual({ left: 'Bien', right: 'mal / autre' });
    expect(parseSpectrumLine('Froid')).toEqual({ left: 'Froid', right: '' });
    expect(spectrumLine({ left: 'Froid', right: 'Chaud' })).toBe('Froid / Chaud');
  });

  it('closest needles (ties included)', () => {
    const needle = (id: string, value: number) => ({
      id,
      value,
      nickname: id,
      avatar: 'batman' as const,
      points: 0,
    });
    expect(closestNeedles({ target: 50, needles: [] })).toEqual([]);
    expect(
      closestNeedles({ target: 50, needles: [needle('a', 47), needle('b', 53), needle('c', 60)] }),
    ).toEqual(['a', 'b']);
  });

  it('lanes: overlapping needles go on other rows', () => {
    expect(needleLanes([50, 52, 70, 51, 80], 6)).toEqual([0, 2, 0, 1, 0]);
    expect(needleLanes([], 6)).toEqual([]);
  });

  it('result titles', () => {
    const r = (yours: number | undefined, correct: boolean, points: number, psychic = false) => ({
      correct,
      pointsEarned: points,
      wavelength: { psychic, clue: 'Tiède' as string | null, target: 50, yours },
    });
    expect(wavelengthResultTitle(r(52, true, 1000))).toBe('🎯 Pile dessus !');
    expect(wavelengthResultTitle(r(60, true, 600))).toBe('Bien vu !');
    expect(wavelengthResultTitle(r(70, false, 300))).toBe('Presque !');
    expect(wavelengthResultTitle(r(0, false, 0))).toBe('Raté !');
    expect(wavelengthResultTitle(r(undefined, false, 0))).toBe('Temps écoulé !');
    expect(wavelengthResultTitle(r(undefined, false, 450, true))).toBe('Bien joué, médium !');
    expect(
      wavelengthResultTitle({
        ...r(undefined, false, 0),
        wavelength: { psychic: false, clue: null, target: 50 },
      }),
    ).toBe('Pas d’indice !');
  });
});
