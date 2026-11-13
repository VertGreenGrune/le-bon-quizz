import { describe, expect, it } from 'vitest';
import { hostUrl, parseGameOptions } from './gameOptions';

const parse = (url: string) => parseGameOptions(new URL(url, 'http://x').searchParams);

describe('game options in the host URL', () => {
  it('builds /host/new URLs (old solo URLs unchanged)', () => {
    expect(hostUrl(undefined)).toBe('/host/new');
    expect(hostUrl('q 1')).toBe('/host/new?quizId=q+1');
    expect(hostUrl('abc', { mode: 'teams', teamCount: 3 })).toBe(
      '/host/new?quizId=abc&mode=teams&teams=3',
    );
    expect(hostUrl(undefined, { mode: 'teams' })).toBe('/host/new?mode=teams&teams=2');
  });

  it('parses them back, falling back to solo / 2 teams', () => {
    expect(parse(hostUrl('abc', { mode: 'teams', teamCount: 4 }))).toEqual({
      mode: 'teams',
      teamCount: 4,
    });
    expect(parse('/host/new?quizId=abc')).toEqual({ mode: 'solo' });
    expect(parse('/host/new?mode=teams&teams=9')).toEqual({ mode: 'teams', teamCount: 2 });
    expect(parse('/host/new?mode=other&teams=3')).toEqual({ mode: 'solo' });
  });

  it('carries the jokers option', () => {
    expect(hostUrl('abc', { mode: 'solo', jokers: true })).toBe('/host/new?quizId=abc&jokers=1');
    expect(parse('/host/new?jokers=1')).toEqual({ mode: 'solo', jokers: true });
    expect(parse(hostUrl(undefined, { mode: 'teams', teamCount: 3, jokers: true }))).toEqual({
      mode: 'teams',
      teamCount: 3,
      jokers: true,
    });
    expect(parse('/host/new?jokers=0')).toEqual({ mode: 'solo' });
  });

  it('carries the « Survie » mode and its hearts (1–5, default 3)', () => {
    expect(hostUrl('abc', { mode: 'survival', hearts: 5, jokers: true })).toBe(
      '/host/new?quizId=abc&mode=survival&hearts=5&jokers=1',
    );
    expect(parse(hostUrl(undefined, { mode: 'survival', hearts: 1 }))).toEqual({
      mode: 'survival',
      hearts: 1,
    });
    expect(parse('/host/new?mode=survival&hearts=9&jokers=1')).toEqual({
      mode: 'survival',
      hearts: 3,
      jokers: true,
    });
    expect(parse('/host/new?mode=survival')).toEqual({ mode: 'survival', hearts: 3 });
  });

  it('carries the TV theme override (T40); unknown → the quiz theme', () => {
    expect(hostUrl('abc', { mode: 'solo', theme: 'christmas' })).toBe(
      '/host/new?quizId=abc&theme=christmas',
    );
    expect(parse('/host/new?quizId=abc&theme=christmas')).toEqual({
      mode: 'solo',
      theme: 'christmas',
    });
    expect(parse(hostUrl('abc', { mode: 'teams', teamCount: 3, theme: 'retro' }))).toEqual({
      mode: 'teams',
      teamCount: 3,
      theme: 'retro',
    });
    expect(parse('/host/new?theme=disco')).toEqual({ mode: 'solo' });
  });

  it('« 🧪 Tester » (T66): a test game, maybe one question (1-based in the URL)', () => {
    expect(hostUrl('abc', { mode: 'solo', test: true, question: 4 })).toBe(
      '/host/new?quizId=abc&test=1&question=5',
    );
    expect(parse('/host/new?quizId=abc&test=1&question=5')).toEqual({
      mode: 'solo',
      test: true,
      question: 4,
    });
    expect(parse('/host/new?quizId=abc&test=1')).toEqual({ mode: 'solo', test: true });
    expect(parse('/host/new?question=0')).toEqual({ mode: 'solo' });
  });
});
