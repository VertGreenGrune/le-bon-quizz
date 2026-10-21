import { describe, expect, it } from 'vitest';
import { AVATARS, PlayerJoinPayload, findAvatar, isAvatarId, randomAvatarId } from './index.js';

describe('avatars', () => {
  it('has 24 avatars with unique ids, emojis and colors', () => {
    expect(AVATARS).toHaveLength(24);
    for (const key of ['id', 'emoji', 'color'] as const)
      expect(new Set(AVATARS.map((a) => a[key])).size).toBe(24);
  });

  it('finds avatars by id', () => {
    expect(findAvatar('fox')?.emoji).toBe('🦊');
    expect(findAvatar('nope')).toBeUndefined();
    expect(findAvatar(null)).toBeUndefined();
    expect(isAvatarId('whale')).toBe(true);
    expect(isAvatarId('Whale')).toBe(false);
    expect(isAvatarId(3)).toBe(false);
  });

  it('random avatar skips the ones to avoid while some are free', () => {
    const avoid = AVATARS.slice(1).map((a) => a.id);
    expect(randomAvatarId(avoid)).toBe(AVATARS[0].id);
    expect(isAvatarId(randomAvatarId(AVATARS.map((a) => a.id)))).toBe(true);
    expect(randomAvatarId([], () => 0.999)).toBe(AVATARS[23].id);
  });

  it('player:join: avatar optional, but must be a known id', () => {
    const base = { pin: '123456', nickname: 'Loïc' };
    expect(PlayerJoinPayload.safeParse(base).success).toBe(true);
    expect(PlayerJoinPayload.parse({ ...base, avatar: 'koala' }).avatar).toBe('koala');
    expect(PlayerJoinPayload.safeParse({ ...base, avatar: 'dragon' }).success).toBe(false);
    expect(PlayerJoinPayload.safeParse({ ...base, avatar: 7 }).success).toBe(false);
  });
});
