import {
  JOKERS,
  jokerAvailability,
  jokerRefusal,
  type JokerResult,
  type JokerType,
  type JokerUsedPayload,
  type LobbyMember,
  type PlayerJokersPayload,
} from '@lbq/shared';

/** TV / phone announcement of a played joker: a big line + a smaller detail. */
export function announcement(p: JokerUsedPayload): { title: string; detail: string } {
  const by = p.by.nickname;
  const target = p.target?.nickname ?? '';
  const name = JOKERS[p.joker].name;
  if (p.blocked)
    return { title: `🛡️ ${target} bloque le ${name} de ${by} !`, detail: 'Bouclier !' };
  if (p.haunt)
    return p.joker === 'freeze'
      ? { title: `👻 ${by} hante ${target} : Gel !`, detail: 'Bloqué 5 s à sa prochaine question' }
      : {
          title: `👻 ${by} hante ${target} : Brouilleur !`,
          detail: 'Boutons mélangés à sa prochaine question',
        };
  switch (p.joker) {
    case 'fifty':
      return { title: `🎯 ${by} joue le 50/50 !`, detail: 'La moitié des pièges disparaît' };
    case 'copy':
      return { title: `🦜 ${by} copie quelqu'un…`, detail: 'Mais qui ?' };
    case 'freeze':
      return { title: `🥶 ${by} a gelé ${target} !`, detail: 'Bloqué 5 s sur cette question' };
    case 'scramble':
      return {
        title: `🌀 ${by} brouille ${target} !`,
        detail: 'Ses boutons bougent dans tout l’écran !',
      };
    case 'double':
      return { title: `✖️2 ${by} joue Double ou rien !`, detail: 'Points ×2… ou −500' };
    case 'shield':
      return { title: `🛡️ ${by} sort son Bouclier !`, detail: 'Attaques bloquées, série protégée' };
    case 'thief':
      return {
        title: `🦹 ${by} lance la roue du Voleur !`,
        detail: 'Réponse à la révélation : qui va perdre 10 % ?',
      };
    case 'hourglass':
      return { title: `⏳ ${by} retourne le Sablier !`, detail: 'Rapidité comptée ×2' };
  }
}

/** One line per joker effect on the phone's result screen. */
export function resultLine(r: JokerResult): string {
  switch (r.kind) {
    case 'double':
      return `✖️2 Double ou rien : + ${r.points} pts en plus !`;
    case 'doubleLost':
      return `✖️2 Double ou rien : − ${r.points} pts`;
    case 'shieldSaved':
      return '🛡️ Bouclier : ta série est sauvée';
    case 'stole':
      return `🦹 Tu as volé ${r.points} pts à ${r.player.nickname} !`;
    case 'stolen':
      return `🦹 La roue de ${r.player.nickname} t'a désigné : − ${r.points} pts`;
    case 'selfRobbed':
      return `🦹 Pas de chance, ta roue est tombée sur toi : − ${r.points} pts`;
    case 'stealBlocked':
      return `🦹 Ta roue a désigné ${r.player.nickname}… protégé par son Bouclier !`;
    case 'wheelShielded':
      return `🛡️ La roue de ${r.player.nickname} t'a désigné, ton Bouclier t'a protégé`;
    case 'copied':
      return `🦜 Réponse copiée sur ${r.player.nickname}`;
    case 'copyMissed':
      return `🦜 ${r.player.nickname} n'a pas répondu : rien à copier`;
    case 'hourglass':
      return `⏳ Sablier : + ${r.points} pts de rapidité`;
    case 'earned':
      return `🎁 Nouveau joker : ${JOKERS[r.joker].icon} ${JOKERS[r.joker].name}`;
  }
}

/** This player already answered the current question (`joker:state.answered`, T42). */
export function answeredNow(state: PlayerJokersPayload, playerId: string | null): boolean {
  return playerId !== null && !!state.answered?.includes(playerId);
}

/**
 * Why this joker can't be played now (greyed out with this reason), null when it can. Without a
 * question type: playable (the server decides).
 */
export function jokerBlocked(
  state: PlayerJokersPayload,
  joker: JokerType,
  answered = false,
): string | null {
  if (!state.questionType) return null;
  return jokerRefusal(state.questionType, joker, { buzzer: !!state.buzzer, answered });
}

/** Can this joker be played now (question type known)? Without a type: yes (server decides). */
export function jokerPlayable(
  state: PlayerJokersPayload,
  joker: JokerType,
  answered = false,
): boolean {
  return jokerBlocked(state, joker, answered) === null;
}

/** The question takes no joker at all (e.g. a poll, a « Buzzer » question): the bar is hidden. */
export function noJokersHere(state: PlayerJokersPayload): boolean {
  return !!state.questionType && !jokerAvailability(state.questionType, !!state.buzzer).jokers;
}

/**
 * Players this joker may target (same rules as the server): not yourself; team mode → attacks
 * on the other teams, Copieur in your own team (Voleur: no target, T51); one attack per target per question;
 * Gel / Brouilleur only on players who haven't answered yet (T42).
 */
export function eligibleTargets(
  state: PlayerJokersPayload,
  joker: JokerType,
  myTeamId: number | null,
): LobbyMember[] {
  const info = JOKERS[joker];
  if (!info.target) return [];
  return state.others
    .filter((p) => {
      if (myTeamId !== null && p.teamId !== undefined) {
        const same = p.teamId === myTeamId;
        if (joker === 'copy' && !same) return false;
        if (info.attack && same) return false;
      }
      if ((joker === 'freeze' || joker === 'scramble') && state.answered?.includes(p.id))
        return false;
      return !(info.attack && state.attacked.includes(p.id));
    })
    .map(({ id, nickname, avatar }) => ({ id, nickname, avatar }));
}

/** TV queue of announcements: one shown at a time, the next one when it is done (`null`). */
export function nextAnnouncements<T>(queue: T[], added: T | null): T[] {
  return added === null ? queue.slice(1) : [...queue, added];
}
