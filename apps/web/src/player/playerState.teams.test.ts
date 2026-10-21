import { describe, expect, it } from 'vitest';
import {
  formatRank,
  initialPlayerState,
  myTeam,
  playerReducer,
  playerScreen,
  type PlayerAction,
} from './playerState';

const run = (...actions: PlayerAction[]) => actions.reduce(playerReducer, initialPlayerState);

const teams = {
  teams: [
    {
      id: 0 as const,
      name: 'Équipe Rouge',
      members: [{ id: 'me', nickname: 'Moi', avatar: 'fox' as const }],
    },
    { id: 1 as const, name: 'Équipe Bleue', members: [] },
  ],
};

describe('player state (team mode)', () => {
  it('finds its own team from lobby:teams and the session player id', () => {
    const s = run(
      { type: 'session', playerId: 'me', nickname: 'Moi', totalScore: 0 },
      {
        type: 'state',
        payload: { phase: 'LOBBY', mode: 'teams', questionIndex: -1, totalQuestions: 3 },
        now: 0,
      },
      { type: 'teams', payload: teams },
    );
    expect(s.mode).toBe('teams');
    expect(playerScreen(s)).toBe('lobby');
    expect(myTeam(s)?.name).toBe('Équipe Rouge');
    expect(myTeam({ ...s, playerId: 'other' })).toBeNull();
  });

  it('keeps the team podium', () => {
    const s = run({
      type: 'podium',
      top: [],
      teams: [{ id: 1, name: 'Équipe Bleue', score: 10, playerCount: 1 }],
    });
    expect(s.podiumTeams).toHaveLength(1);
    expect(run({ type: 'podium', top: [] }).podiumTeams).toEqual([]);
  });

  it('formats team ranks in the feminine', () => {
    expect(formatRank(1, true)).toBe('1re');
    expect(formatRank(1)).toBe('1er');
    expect(formatRank(2, true)).toBe('2e');
  });
});
