import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAUSE_GRACE_MS,
  QUESTION_INTRO_MS,
  RESUME_COUNTDOWN_MS,
  type LobbyTeamsPayload,
  type PlayerResultPayload,
  type Quiz,
  type ServerToClientEvents,
  type StandingsPayload,
  type TeamCount,
  type TeamId,
} from '@lbq/shared';
import { Game, type GameTransport, type Player } from './Game.js';
import { GameError } from './errors.js';
import { rankTeams, teamQuestionPoints } from './scoring.js';

type Sent = { to: string; event: keyof ServerToClientEvents; payload: unknown };

function recorder() {
  const sent: Sent[] = [];
  const transport: GameTransport = {
    toAll: (event, payload) => void sent.push({ to: 'all', event, payload }),
    toHost: (event, payload) => void sent.push({ to: 'host', event, payload }),
    toSocket: (to, event, payload) => void sent.push({ to, event, payload }),
    detachSocket: () => {},
  };
  const last = (event: Sent['event'], to?: string) =>
    sent.filter((s) => s.event === event && (to === undefined || s.to === to)).at(-1)?.payload;
  return { sent, transport, last, clear: () => (sent.length = 0) };
}

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected GameError ${code}`);
}

/** 3 questions, 2 choices, choice 0 correct, 1000 points: an instant right answer = 1000. */
const quiz: Quiz = {
  id: 'teams',
  title: 'Teams',
  questions: [0, 1, 2].map((i) => ({
    text: `Q${i + 1}`,
    type: 'MCQ' as const,
    timeLimitSec: 20,
    basePoints: 1000,
    choices: [
      { text: 'Oui', isCorrect: true },
      { text: 'Non', isCorrect: false },
    ],
  })),
};
const RIGHT = 0;
const WRONG = 1;

describe('team scoring helpers', () => {
  it('averages the present members, rounded; nobody present → 0', () => {
    expect(teamQuestionPoints([1000, 0])).toBe(500);
    expect(teamQuestionPoints([1000, 1000, 1000, 0, 0])).toBe(600);
    expect(teamQuestionPoints([1000, 0, 0])).toBe(333);
    expect(teamQuestionPoints([])).toBe(0);
  });

  it('ranks teams with shared ranks on ties', () => {
    const ranked = rankTeams([
      { id: 0, score: 500 },
      { id: 1, score: 900 },
      { id: 2, score: 500 },
      { id: 3, score: 100 },
    ]);
    expect(ranked.map((r) => [r.team.id, r.rank])).toEqual([
      [1, 1],
      [0, 2],
      [2, 2],
      [3, 4],
    ]);
  });
});

describe('Game in team mode', () => {
  let rec: ReturnType<typeof recorder>;
  let game: Game;

  beforeEach(() => {
    vi.useFakeTimers(); // Date.now() frozen: every answer is instant (full points)
    rec = recorder();
  });

  afterEach(() => {
    game?.dispose();
    vi.useRealTimers();
  });

  const create = (teamCount: TeamCount = 2) => {
    game = new Game('123456', quiz, rec.transport, {}, { mode: 'teams', teamCount });
    return game;
  };

  /** Joins `names` (socket `sock-<name>`) into `teamId`. */
  const joinTeam = (teamId: TeamId, ...names: string[]): Player[] =>
    names.map((n) => {
      const p = game.join(n, `sock-${n}`);
      game.setTeam(p.id, teamId);
      return p;
    });

  const toAnswering = () => vi.advanceTimersByTime(QUESTION_INTRO_MS);
  const answer = (p: Player, choice: number) => game.answer(p.id, game.questionIndex, choice);
  const teams = () => (rec.last('leaderboard', 'host') as StandingsPayload).teams;
  const result = (p: Player) => rec.last('player:result', p.socketId!) as PlayerResultPayload;

  describe('lobby', () => {
    it('offers teamCount teams to everyone and lists members as players choose', () => {
      create(3);
      expect(game.statePayload().mode).toBe('teams');
      const alice = game.join('Alice', 's1');
      expect(rec.last('lobby:teams', 'all')).toEqual({
        teams: [
          { id: 0, name: 'Équipe Rouge', members: [] },
          { id: 1, name: 'Équipe Bleue', members: [] },
          { id: 2, name: 'Équipe Jaune', members: [] },
        ],
      });
      expect(rec.last('lobby:players', 'host')).toEqual({
        players: [{ id: alice.id, nickname: 'Alice', avatar: expect.any(String) }],
      });

      game.setTeam(alice.id, 2);
      expect((rec.last('lobby:teams', 'all') as LobbyTeamsPayload).teams[2]!.members).toEqual([
        { id: alice.id, nickname: 'Alice', avatar: expect.any(String) },
      ]);
      expect(rec.last('lobby:players', 'host')).toEqual({
        players: [{ id: alice.id, nickname: 'Alice', avatar: expect.any(String), teamId: 2 }],
      });
      game.setTeam(alice.id, 0); // can switch until the start
      expect(alice.teamId).toBe(0);
    });

    it('rejects unknown teams, solo games and changes after the start', () => {
      create(2);
      const [alice] = joinTeam(0, 'Alice');
      joinTeam(1, 'Bob');
      expectGameError(() => game.setTeam(alice!.id, 3), 'INVALID_PAYLOAD');
      expectGameError(() => game.setTeam('nobody', 1), 'SESSION_NOT_FOUND');
      game.start();
      expectGameError(() => game.setTeam(alice!.id, 1), 'GAME_ALREADY_STARTED');
      expectGameError(() => game.shuffleTeams(), 'GAME_ALREADY_STARTED');

      const solo = new Game('654321', quiz, rec.transport);
      const p = solo.join('Zoé', 's9');
      expectGameError(() => solo.setTeam(p.id, 0), 'INVALID_PAYLOAD');
      expectGameError(() => solo.shuffleTeams(), 'INVALID_PAYLOAD');
      solo.dispose();
    });

    it('needs every player in a team and at least 2 teams with players to start', () => {
      create(3);
      const [alice] = joinTeam(0, 'Alice');
      const bob = game.join('Bob', 'sock-Bob');
      expectGameError(() => game.start(), 'TEAMS_NOT_READY');
      expectGameError(() => game.next(), 'TEAMS_NOT_READY'); // next() from LOBBY = start
      game.setTeam(bob.id, 0);
      expectGameError(() => game.start(), 'TEAMS_NOT_READY'); // everybody in one team
      expect(game.phase).toBe('LOBBY');

      game.setTeam(bob.id, 2);
      game.start();
      expect(game.phase).toBe('QUESTION_INTRO');
      // The empty team (Bleue) is dropped.
      expect((rec.last('lobby:teams', 'all') as LobbyTeamsPayload).teams).toEqual([
        {
          id: 0,
          name: 'Équipe Rouge',
          members: [{ id: alice!.id, nickname: 'Alice', avatar: expect.any(String) }],
        },
        {
          id: 2,
          name: 'Équipe Jaune',
          members: [{ id: bob.id, nickname: 'Bob', avatar: expect.any(String) }],
        },
      ]);
    });

    it('shuffles everyone into balanced random teams', () => {
      create(2);
      const players = ['A', 'B', 'C', 'D', 'E'].map((n) => game.join(n, `s-${n}`));
      game.setTeam(players[0]!.id, 1);
      game.shuffleTeams(() => 0.5);
      const sizes = [0, 1].map((t) => players.filter((p) => p.teamId === t).length);
      expect(sizes.sort()).toEqual([2, 3]);
      expect(players.every((p) => p.teamId !== null)).toBe(true);

      create(4);
      const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => game.join(n, `s-${n}`));
      game.shuffleTeams();
      const counts = [0, 1, 2, 3].map((t) => six.filter((p) => p.teamId === t).length);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    });

    it('a lobby kick removes the player from their team', () => {
      create(2);
      const [alice] = joinTeam(0, 'Alice');
      joinTeam(1, 'Bob');
      game.kick(alice!.id);
      const t = (rec.last('lobby:teams', 'all') as LobbyTeamsPayload).teams;
      expect(t[0]!.members).toEqual([]);
      expect(t[1]!.members).toHaveLength(1);
    });
  });

  describe('scoring (average per present player)', () => {
    it('makes a team of 2 and a team of 5 comparable', () => {
      create(2);
      const [r1, r2] = joinTeam(0, 'R1', 'R2');
      const blue = joinTeam(1, 'B1', 'B2', 'B3', 'B4', 'B5');
      game.start();
      toAnswering();
      answer(r1!, RIGHT);
      answer(r2!, WRONG);
      blue.forEach((p, i) => answer(p, i < 3 ? RIGHT : WRONG));
      expect(game.phase).toBe('REVEAL');

      // Red: (1000 + 0) / 2 = 500. Blue: 3 × 1000 / 5 = 600 (a plain sum would give 3000).
      expect(result(r1!)).toMatchObject({
        pointsEarned: 1000,
        team: { id: 0, score: 500, rank: 2 },
      });
      expect(result(blue[0]!)).toMatchObject({ team: { id: 1, score: 600, rank: 1 } });

      game.next(); // → LEADERBOARD
      expect(teams()).toEqual([
        { id: 1, name: 'Équipe Bleue', score: 600, playerCount: 5, gained: 600 },
        { id: 0, name: 'Équipe Rouge', score: 500, playerCount: 2, gained: 500 },
      ]);
      // Individual ranking (everyone, up to LEADERBOARD_SIZE) still comes with it.
      expect((rec.last('leaderboard', 'host') as StandingsPayload).top).toHaveLength(7);

      // Q2: everyone right → +1100 each (streak bonus +100 for those already right).
      game.next();
      toAnswering();
      [r1!, r2!, ...blue].forEach((p) => answer(p, RIGHT));
      // Red: (1100 + 1000) / 2 = 1050. Blue: (3 × 1100 + 2 × 1000) / 5 = 1060.
      game.next();
      expect(teams()!.map((t) => [t.id, t.score])).toEqual([
        [1, 1660],
        [0, 1550],
      ]);
    });

    it('ignores a player absent for the whole question, counts one who drops mid-question as 0', () => {
      create(2);
      const [r1, r2] = joinTeam(0, 'R1', 'R2');
      const [b1, b2] = joinTeam(1, 'B1', 'B2');
      game.start();
      game.disconnect(r2!.socketId!); // gone before ANSWERING starts…
      vi.advanceTimersByTime(PAUSE_GRACE_MS);
      expect(game.paused).toBe(true);
      game.resume(); // …and the host continues without them
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
      toAnswering();
      answer(r1!, RIGHT);
      answer(b1!, RIGHT);
      game.disconnect(b2!.socketId!); // drops mid-question → the game waits for B2…
      vi.advanceTimersByTime(PAUSE_GRACE_MS);
      expect(game.paused).toBe(true);
      game.next(); // …until the host skips the question: B2 was present, so counts as 0
      expect(game.phase).toBe('REVEAL');

      // Red: only R1 present → 1000. Blue: (1000 + 0) / 2 = 500.
      expect(result(r1!).team).toEqual({ id: 0, score: 1000, rank: 1 });
      expect(result(b1!).team).toEqual({ id: 1, score: 500, rank: 2 });

      // R2 comes back for Q2 and counts again; B2 is still gone (the host continues without).
      const back = game.rejoin(r2!.sessionToken, 'sock-R2-bis');
      game.next();
      game.next();
      expect(game.paused).toBe(true);
      game.resume();
      vi.advanceTimersByTime(RESUME_COUNTDOWN_MS);
      toAnswering();
      answer(back, WRONG);
      answer(r1!, WRONG);
      answer(b1!, WRONG);
      game.next();
      expect(teams()!.map((t) => [t.id, t.score, t.playerCount])).toEqual([
        [0, 1000, 2],
        [1, 500, 2],
      ]);
    });

    it('a kicked player stops counting from the next question, past points stay', () => {
      create(2);
      const [r1, r2] = joinTeam(0, 'R1', 'R2');
      const [b1] = joinTeam(1, 'B1');
      game.start();
      toAnswering();
      answer(r1!, RIGHT);
      answer(r2!, WRONG);
      answer(b1!, WRONG);
      game.next(); // → LEADERBOARD: Red 500, Blue 0
      expect(teams()!.map((t) => [t.id, t.score])).toEqual([
        [0, 500],
        [1, 0],
      ]);

      game.kick(r2!.id);
      expect((rec.last('lobby:teams', 'all') as LobbyTeamsPayload).teams[0]!.members).toEqual([
        { id: r1!.id, nickname: 'R1', avatar: expect.any(String) },
      ]);
      game.next();
      toAnswering();
      answer(r1!, RIGHT); // 1000 + 100 streak bonus, alone in Red now
      answer(b1!, RIGHT);
      game.next();
      expect(teams()).toEqual([
        { id: 0, name: 'Équipe Rouge', score: 1600, playerCount: 1, gained: 1100 },
        { id: 1, name: 'Équipe Bleue', score: 1000, playerCount: 1, gained: 1000 },
      ]);
      // The kicked player is still saved, with their team.
      expect(game.standings().find((s) => s.nickname === 'R2')).toMatchObject({ teamId: 0 });
    });

    it('teams with equal scores share a rank', () => {
      create(2);
      const [r1] = joinTeam(0, 'R1');
      const [b1] = joinTeam(1, 'B1');
      game.start();
      toAnswering();
      answer(r1!, RIGHT);
      answer(b1!, RIGHT);
      expect(result(r1!).team).toEqual({ id: 0, score: 1000, rank: 1 });
      expect(result(b1!).team).toEqual({ id: 1, score: 1000, rank: 1 });
    });
  });

  it('plays to the podium with teams, saved standings and resyncs', () => {
    create(3);
    const [r1] = joinTeam(0, 'R1');
    const [b1, b2] = joinTeam(1, 'B1', 'B2');
    game.start();
    for (let q = 0; q < quiz.questions.length; q++) {
      toAnswering();
      answer(r1!, RIGHT);
      answer(b1!, RIGHT);
      answer(b2!, WRONG);
      game.next(); // → LEADERBOARD
      game.next(); // → next question / PODIUM
    }
    expect(game.phase).toBe('PODIUM');
    // Red: 1000 + 1100 + 1200 = 3300. Blue: half of B1's 3300 each question = 500 + 550 + 600.
    const podium = rec.last('podium', 'all') as StandingsPayload;
    expect(podium.teams).toEqual([
      { id: 0, name: 'Équipe Rouge', score: 3300, playerCount: 1 },
      { id: 1, name: 'Équipe Bleue', score: 1650, playerCount: 2 },
    ]);
    expect(podium.top.map((p) => p.nickname)).toEqual(['B1', 'R1', 'B2']);
    expect(game.teamStandings()).toEqual([
      { teamId: 0, name: 'Équipe Rouge', score: 3300, playerCount: 1, rank: 1 },
      { teamId: 1, name: 'Équipe Bleue', score: 1650, playerCount: 2, rank: 2 },
    ]);
    expect(game.standings().map((s) => [s.nickname, s.teamId])).toEqual([
      ['B1', 1],
      ['R1', 0],
      ['B2', 1],
    ]);

    // Phone and host resyncs include the teams.
    rec.clear();
    game.resync(game.rejoin(b2!.sessionToken, 'sock-B2-bis'));
    expect(rec.sent.filter((s) => s.to === 'sock-B2-bis').map((s) => s.event)).toEqual([
      'game:state',
      'lobby:teams',
      'podium',
    ]);
    rec.clear();
    game.resyncHost('host-2');
    expect(rec.sent.map((s) => s.event)).toEqual([
      'game:state',
      'lobby:players',
      'lobby:teams',
      'podium',
      'remote:status',
    ]);
    expect((rec.last('podium', 'host-2') as StandingsPayload).teams).toHaveLength(2);
  });

  it('solo games send no team data', () => {
    game = new Game('123456', quiz, rec.transport);
    const alice = game.join('Alice', 's1');
    game.start();
    toAnswering();
    game.answer(alice.id, 0, RIGHT);
    game.next();
    expect(rec.sent.some((s) => s.event === 'lobby:teams')).toBe(false);
    expect(rec.last('player:result', 's1')).not.toHaveProperty('team');
    expect(rec.last('leaderboard', 'host')).not.toHaveProperty('teams');
    expect(game.teamStandings()).toEqual([]);
  });
});
