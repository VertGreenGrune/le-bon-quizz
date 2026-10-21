import { isAvatarId, randomAvatarId, type AvatarId } from '@lbq/shared';

/** The avatar picked on this phone, remembered in localStorage for the next games. */
const KEY = 'lbq:avatar';

export function loadAvatarChoice(): AvatarId | null {
  try {
    const id = localStorage.getItem(KEY);
    return isAvatarId(id) ? id : null;
  } catch {
    return null; // storage disabled
  }
}

export function saveAvatarChoice(id: AvatarId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Private mode / storage disabled: a random avatar will be preselected next time.
  }
}

/** Join screen preselection: the remembered avatar, else a random one. */
export function initialAvatar(random?: () => number): AvatarId {
  return loadAvatarChoice() ?? randomAvatarId([], random);
}
