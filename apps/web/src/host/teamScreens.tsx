import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  SHAPES,
  type LobbyMember,
  type LobbyPlayersPayload,
  type LobbyTeamsPayload,
  type RankedPlayer,
  type RankedTeam,
  type TeamId,
} from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { Confetti } from '../components/motion';
import { ShapeIcon, shapeBg } from '../components/shapes';
import { competitionRanks } from '../lib/ranks';
import { teamLobbyStatus } from './hostReducer';

type Team = LobbyTeamsPayload['teams'][number];
type LobbyPlayer = LobbyPlayersPayload['players'][number];

export const TEAM_RULE = "Score d'équipe = moyenne des points par joueur";

function TeamBadge({ id, className = 'size-7' }: { id: TeamId; className?: string }) {
  return <ShapeIcon shape={SHAPES[id].shape} className={`${className} shrink-0 fill-white`} />;
}

// ---------- Lobby ----------

/**
 * Team columns of the lobby. Tapping a player opens a small menu to move them to another team
 * (or exclude them); "Mélanger" deals random balanced teams.
 */
export function TeamLobby({
  players,
  teams,
  onMove,
  onKick,
  onShuffle,
}: {
  players: LobbyPlayer[];
  teams: Team[];
  onMove: (playerId: string, teamId: TeamId) => void;
  onKick: (playerId: string) => void;
  onShuffle: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { unassigned, unbalanced } = teamLobbyStatus({ players, teams });
  const loose = players.filter((p) => p.teamId === undefined);

  const member = (p: LobbyMember, teamId: TeamId | null) => (
    <motion.li
      key={p.id}
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
      className="relative"
    >
      <button
        type="button"
        onClick={() => setSelected(selected === p.id ? null : p.id)}
        aria-expanded={selected === p.id}
        className="flex w-full items-center gap-3 rounded-full bg-panel py-2 pr-4 pl-2 text-xl font-bold hover:bg-black/40"
      >
        <motion.span
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 10, delay: 0.15 }}
          className="flex"
        >
          <Avatar id={p.avatar} size="md" />
        </motion.span>
        <span className="truncate">{p.nickname}</span>
      </button>
      {selected === p.id && (
        <div className="absolute top-full left-0 z-10 mt-1 flex w-56 flex-col gap-1 rounded-xl bg-white p-2 text-base text-gray-900 shadow-2xl">
          {teams
            .filter((t) => t.id !== teamId)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onMove(p.id, t.id);
                  setSelected(null);
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-bold text-white ${shapeBg[SHAPES[t.id].color]}`}
              >
                <TeamBadge id={t.id} className="size-4" />→ {t.name}
              </button>
            ))}
          <button
            type="button"
            onClick={() => {
              onKick(p.id);
              setSelected(null);
            }}
            className="rounded-lg px-3 py-1.5 font-bold text-answer-red hover:bg-red-50"
          >
            Exclure
          </button>
        </div>
      )}
    </motion.li>
  );

  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-4 text-xl font-semibold">
        <button
          type="button"
          onClick={onShuffle}
          disabled={players.length === 0}
          className="rounded-lg border-2 border-white/70 px-4 py-1.5 font-bold hover:bg-white/10 disabled:opacity-40"
        >
          🔀 Mélanger
        </button>
        {unassigned > 0 && (
          <span className="rounded-lg bg-panel px-3 py-1.5">
            {unassigned} joueur{unassigned > 1 ? 's' : ''} sans équipe
          </span>
        )}
        {unbalanced && (
          <span className="rounded-lg bg-answer-yellow/90 px-3 py-1.5 text-black">
            Équipes déséquilibrées — le score reste équitable
          </span>
        )}
      </div>
      <div className="grid w-full auto-cols-fr grid-flow-col gap-4">
        {teams.map((t) => (
          <section key={t.id} className="flex min-w-0 flex-col rounded-2xl bg-black/15">
            <h3
              className={`flex items-center gap-2 rounded-t-2xl px-4 py-2 text-2xl font-black ${shapeBg[SHAPES[t.id].color]}`}
            >
              <TeamBadge id={t.id} />
              <span className="flex-1 truncate">{t.name}</span>
              <span className="tabular-nums">{t.members.length}</span>
            </h3>
            <ul className="flex flex-col gap-2 p-3">
              <AnimatePresence>{t.members.map((p) => member(p, t.id))}</AnimatePresence>
            </ul>
          </section>
        ))}
        {loose.length > 0 && (
          <section className="flex min-w-0 flex-col rounded-2xl border-2 border-dashed border-white/40">
            <h3 className="px-4 py-2 text-2xl font-black opacity-80">Sans équipe</h3>
            <ul className="flex flex-col gap-2 p-3">
              <AnimatePresence>{loose.map((p) => member(p, null))}</AnimatePresence>
            </ul>
          </section>
        )}
      </div>
      <p className="text-lg opacity-80">
        Les joueurs choisissent leur équipe sur leur téléphone. Touchez un nom pour le changer
        d'équipe.
      </p>
    </div>
  );
}

// ---------- Leaderboard ----------

/** Team ranking shown above / beside the individual leaderboard. */
export function TeamRanking({ teams, instant }: { teams: RankedTeam[]; instant: boolean }) {
  const ranks = competitionRanks(teams.map((t) => t.score));
  return (
    <section className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {teams.map((t, i) => (
          <motion.li
            key={t.id}
            layout
            initial={instant ? false : { x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: instant ? 0 : i * 0.15 }}
            className={`flex items-center gap-4 rounded-xl px-6 py-3 text-3xl font-black shadow-lg ${shapeBg[SHAPES[t.id].color]}`}
          >
            <span className="w-8 tabular-nums">{ranks[i]}</span>
            <TeamBadge id={t.id} className="size-9" />
            <span className="flex-1 truncate">{t.name}</span>
            <span className="text-xl font-bold opacity-90">
              {t.playerCount} joueur{t.playerCount > 1 ? 's' : ''}
            </span>
            <span className="tabular-nums">{t.score}</span>
          </motion.li>
        ))}
      </ol>
      <p className="text-center text-lg font-semibold opacity-80">{TEAM_RULE}</p>
    </section>
  );
}

// ---------- Podium ----------

/** Same timing as the solo podium (3rd → 2nd → 1st), so `podium.wav` still fits. */
const SLOTS = [
  { place: 1, height: 'h-[28vh]', delay: 2 },
  { place: 0, height: 'h-[38vh]', delay: 3.2 },
  { place: 2, height: 'h-[20vh]', delay: 0.8 },
] as const;
const WINNER_DELAY = 3.2;

export function TeamPodiumScreen({
  teams,
  top,
  instant,
}: {
  teams: RankedTeam[];
  /** Individual podium: `top[0]` is the best player. */
  top: RankedPlayer[];
  instant: boolean;
}) {
  const ranks = competitionRanks(teams.map((t) => t.score));
  const best = top[0];
  return (
    <div className="flex flex-1 flex-col items-center gap-3 p-6">
      <h2 className="theme-lobby-title font-display text-5xl font-black">Podium des équipes</h2>
      <div className="flex flex-1 items-end gap-6">
        {SLOTS.map(({ place, height, delay }) => {
          const t = teams[place];
          if (!t) return null;
          return (
            <motion.div
              key={t.id}
              className="flex w-72 flex-col items-center gap-3"
              initial={instant ? false : { y: 400, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay, type: 'spring', stiffness: 80, damping: 14 }}
            >
              {ranks[place] === 1 && (
                <motion.span
                  className="text-7xl"
                  aria-hidden="true"
                  initial={instant ? false : { scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: instant ? 0 : WINNER_DELAY + 0.5, type: 'spring' }}
                >
                  👑
                </motion.span>
              )}
              <span className="w-full truncate text-center text-4xl font-black">{t.name}</span>
              <span className="text-2xl font-bold tabular-nums">
                {t.score} pts · {t.playerCount} joueur{t.playerCount > 1 ? 's' : ''}
              </span>
              <div
                className={`flex w-full flex-col items-center justify-start gap-2 rounded-t-2xl pt-6 text-8xl font-black shadow-2xl ${height} ${shapeBg[SHAPES[t.id].color]}`}
              >
                {ranks[place]}
                <TeamBadge id={t.id} className="size-12" />
              </div>
            </motion.div>
          );
        })}
      </div>
      {best && (
        <motion.p
          initial={instant ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: instant ? 0 : WINNER_DELAY + 0.8 }}
          className="flex items-center gap-3 rounded-2xl bg-white px-8 py-3 text-3xl font-black text-brand shadow-xl"
        >
          <Avatar id={best.avatar} size="md" />
          <span>
            ⭐ Meilleur joueur : {best.nickname} — {best.score} pts
          </span>
        </motion.p>
      )}
      {!instant && teams.length > 0 && <Confetti delay={WINNER_DELAY + 0.2} />}
    </div>
  );
}
