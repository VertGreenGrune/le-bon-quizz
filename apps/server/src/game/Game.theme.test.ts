import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_QUIZ, type GameStatePayload, type ServerToClientEvents } from '@lbq/shared';
import { Game, type GameTransport } from './Game.js';

type Sent = { to: string; event: keyof ServerToClientEvents; payload: unknown };

function recorder() {
  const sent: Sent[] = [];
  const transport: GameTransport = {
    toAll: (event, payload) => void sent.push({ to: 'all', event, payload }),
    toHost: (event, payload) => void sent.push({ to: 'host', event, payload }),
    toSocket: (to, event, payload) => void sent.push({ to, event, payload }),
    detachSocket: () => {},
  };
  const states = (to?: string) =>
    sent
      .filter((s) => s.event === 'game:state' && (to === undefined || s.to === to))
      .map((s) => s.payload as GameStatePayload);
  return { transport, states };
}

describe('Game TV theme', () => {
  let game: Game;

  afterEach(() => {
    game.dispose();
    vi.useRealTimers();
  });

  it('is classic (absent from game:state) by default', () => {
    const rec = recorder();
    game = new Game(
      '123456',
      DEMO_QUIZ,
      rec.transport,
      {},
      { mode: 'solo', allAnsweredGraceMs: 0 },
    );
    expect(game.theme).toBe('classic');
    game.join('Alice', 's1');
    game.start();
    expect(rec.states().length).toBeGreaterThan(0);
    expect(rec.states().every((s) => s.theme === undefined)).toBe(true);
  });

  it("uses the quiz's theme, or the start dialog's override", () => {
    const rec = recorder();
    game = new Game('123456', { ...DEMO_QUIZ, theme: 'halloween' }, rec.transport);
    expect(game.theme).toBe('halloween');
    game.dispose();

    game = new Game('123456', { ...DEMO_QUIZ, theme: 'halloween' }, rec.transport, undefined, {
      mode: 'solo',
      theme: 'christmas',
    });
    expect(game.theme).toBe('christmas');
    expect(game.statePayload().theme).toBe('christmas');
  });

  it('sends the theme in every game:state, including both resyncs', () => {
    vi.useFakeTimers();
    const rec = recorder();
    game = new Game('123456', { ...DEMO_QUIZ, theme: 'space' }, rec.transport, undefined, {
      mode: 'teams',
    });
    const alice = game.join('Alice', 's1');
    game.setTeam(alice.id, 0);
    const bob = game.join('Bob', 's2');
    game.setTeam(bob.id, 1);
    game.start();
    expect(rec.states('all').at(-1)).toMatchObject({ phase: 'QUESTION_INTRO', theme: 'space' });

    game.resyncHost('host-socket');
    expect(rec.states('host-socket').at(-1)?.theme).toBe('space');
    game.disconnect('s1');
    const back = game.rejoin(alice.sessionToken, 'phone-socket');
    game.resync(back);
    expect(rec.states('phone-socket').at(-1)?.theme).toBe('space');
  });
});
