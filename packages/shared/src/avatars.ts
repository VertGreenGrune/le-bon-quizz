import { z } from 'zod';

/**
 * Player avatars: a fixed set of animal emojis on a colored circle, bundled in the app (no
 * upload). Picked on the phone join screen, shown next to the nickname everywhere.
 */
export const AVATARS = [
  { id: 'fox', emoji: '🦊', color: '#fb923c' },
  { id: 'panda', emoji: '🐼', color: '#a3e635' },
  { id: 'frog', emoji: '🐸', color: '#38bdf8' },
  { id: 'lion', emoji: '🦁', color: '#facc15' },
  { id: 'octopus', emoji: '🐙', color: '#2dd4bf' },
  { id: 'unicorn', emoji: '🦄', color: '#c084fc' },
  { id: 'penguin', emoji: '🐧', color: '#60a5fa' },
  { id: 'koala', emoji: '🐨', color: '#f9a8d4' },
  { id: 'tiger', emoji: '🐯', color: '#4ade80' },
  { id: 'monkey', emoji: '🐵', color: '#fcd34d' },
  { id: 'rabbit', emoji: '🐰', color: '#f472b6' },
  { id: 'bear', emoji: '🐻', color: '#7dd3fc' },
  { id: 'pig', emoji: '🐷', color: '#86efac' },
  { id: 'cow', emoji: '🐮', color: '#fda4af' },
  { id: 'chicken', emoji: '🐔', color: '#93c5fd' },
  { id: 'owl', emoji: '🦉', color: '#fdba74' },
  { id: 'turtle', emoji: '🐢', color: '#fde047' },
  { id: 'dolphin', emoji: '🐬', color: '#fca5a5' },
  { id: 'trex', emoji: '🦖', color: '#a78bfa' },
  { id: 'bee', emoji: '🐝', color: '#22d3ee' },
  { id: 'butterfly', emoji: '🦋', color: '#fde68a' },
  { id: 'cat', emoji: '🐱', color: '#818cf8' },
  { id: 'dog', emoji: '🐶', color: '#34d399' },
  { id: 'whale', emoji: '🐳', color: '#f87171' },
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
