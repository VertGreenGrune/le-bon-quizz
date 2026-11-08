import { useEffect } from 'react';

/**
 * The TV screens are designed (and checked) at 1600 × 900 with a 16 px root font. TV browsers
 * report very different viewports for the same picture: 960 × 540 (Fire TV Silk), 1920 × 1080
 * (a 4K TV at 200 %), 3840 × 2160… With fixed sizes the page then overflows and the bottom row
 * of answers falls off the screen (a TV browser often can't scroll). Every size on the host
 * screen is in rem, so scaling the root font with the viewport makes the whole screen scale
 * like a slide: 1 rem = 16 px at 1600 × 900, whichever side is the tighter one.
 */
export const TV_ROOT_FONT_SIZE = 'clamp(9px, min(1.7778vh, 1vw), 48px)';

/** Scales the root font size with the viewport while the host screen is shown. */
export function useTvScale(): void {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = TV_ROOT_FONT_SIZE;
    return () => {
      root.style.fontSize = previous;
    };
  }, []);
}
