import { z } from 'zod';

/**
 * Player avatars: a fixed set of Batman: The Animated Series portraits bundled in the web app
 * (`apps/web/public/avatars/<id>.jpg`, no upload). Picked on the phone join screen, shown next to
 * the nickname everywhere.
 */
export const AVATARS = [
  { id: 'batman', name: 'Batman' },
  { id: 'robin', name: 'Robin' },
  { id: 'batgirl', name: 'Batgirl' },
  { id: 'alfred', name: 'Alfred' },
  { id: 'gordon', name: 'Commissaire Gordon' },
  { id: 'bullock', name: 'Harvey Bullock' },
  { id: 'montoya', name: 'Renee Montoya' },
  { id: 'hill', name: 'Maire Hill' },
  { id: 'joker', name: 'Le Joker' },
  { id: 'harley', name: 'Harley Quinn' },
  { id: 'twoface', name: 'Double-Face' },
  { id: 'ivy', name: 'Poison Ivy' },
  { id: 'catwoman', name: 'Catwoman' },
  { id: 'riddler', name: "L'Homme-Mystère" },
  { id: 'scarecrow', name: "L'Épouvantail" },
  { id: 'penguin', name: 'Le Pingouin' },
  { id: 'freeze', name: 'Mr. Freeze' },
  { id: 'bane', name: 'Bane' },
  { id: 'manbat', name: 'Man-Bat' },
  { id: 'talia', name: 'Talia al Ghul' },
] as const;

export type Avatar = (typeof AVATARS)[number];
export type AvatarId = Avatar['id'];

const ids = AVATARS.map((a) => a.id) as [AvatarId, ...AvatarId[]];
export const AvatarId = z.enum(ids);

const byId = new Map<string, Avatar>(AVATARS.map((a) => [a.id, a]));

/** The avatar with this id, or undefined (e.g. an unknown id read from storage or an old row). */
export function findAvatar(id: string | null | undefined): Avatar | undefined {
  return id ? byId.get(id) : undefined;
}

export function isAvatarId(id: unknown): id is AvatarId {
  return typeof id === 'string' && byId.has(id);
}

/** A random avatar id; `avoid` (e.g. the ones already taken) is skipped while others remain. */
export function randomAvatarId(
  avoid: Iterable<string> = [],
  random: () => number = Math.random,
): AvatarId {
  const taken = new Set(avoid);
  const free = AVATARS.filter((a) => !taken.has(a.id));
  const pool = free.length > 0 ? free : AVATARS;
  return pool[Math.floor(random() * pool.length)]!.id;
}
