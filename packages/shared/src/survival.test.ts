import { describe, expect, it } from 'vitest';
import { HostCreatePayload, PlayerHauntPayload } from './events.js';
import { GameMode } from './game.js';

describe('« Survie » contract', () => {
  it('host:create takes the survival mode and 1–5 hearts', () => {
    expect(GameMode.parse('survival')).toBe('survival');
    expect(HostCreatePayload.safeParse({ quizId: 'q', mode: 'survival', hearts: 5 }).success).toBe(
      true,
    );
    expect(HostCreatePayload.safeParse({ quizId: 'q', mode: 'survival' }).success).toBe(true);
    for (const hearts of [0, 6, 2.5])
      expect(HostCreatePayload.safeParse({ quizId: 'q', mode: 'survival', hearts }).success).toBe(
        false,
      );
  });

  it('player:haunt: Gel or Brouilleur on a target', () => {
    const ok = { pin: '123456', haunt: 'freeze', targetId: 'p1' };
    expect(PlayerHauntPayload.safeParse(ok).success).toBe(true);
    expect(PlayerHauntPayload.safeParse({ ...ok, haunt: 'scramble' }).success).toBe(true);
    expect(PlayerHauntPayload.safeParse({ ...ok, haunt: 'double' }).success).toBe(false);
    expect(PlayerHauntPayload.safeParse({ ...ok, targetId: '' }).success).toBe(false);
  });
});
