import { describe, expect, it, vi } from 'vitest';
import {
  enterFullscreen,
  exitFullscreen,
  fullscreenSupport,
  type FullscreenEnv,
} from './fullscreen';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130 Mobile';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';

function env(over: Partial<FullscreenEnv> = {}, api = true): FullscreenEnv {
  const doc: FullscreenEnv['doc'] = {
    fullscreenEnabled: api,
    fullscreenElement: null,
    documentElement: {
      requestFullscreen: api
        ? vi.fn(async () => {
            doc.fullscreenElement = {} as Element;
          })
        : undefined,
    },
    exitFullscreen: vi.fn(async () => {
      doc.fullscreenElement = null;
    }),
  };
  return { doc, standalone: false, userAgent: ANDROID, ...over };
}

describe('phone full screen', () => {
  it('offers the API where it exists, the home-screen hint on iPhone, nothing otherwise', () => {
    expect(fullscreenSupport(env())).toBe('api');
    expect(fullscreenSupport(env({ userAgent: IPHONE }, false))).toBe('homeScreen');
    expect(fullscreenSupport(env({}, false))).toBe('none');
    expect(fullscreenSupport(env({ standalone: true }))).toBe('standalone');
    expect(fullscreenSupport(null)).toBe('none');
  });

  it('enters with the navigation UI hidden, then locks the portrait (failures ignored)', async () => {
    const lockPortrait = vi.fn(() => Promise.reject(new Error('not supported')));
    const e = env({ lockPortrait });
    expect(await enterFullscreen(e)).toBe(true);
    expect(e.doc.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
    expect(lockPortrait).toHaveBeenCalled();
    expect(e.doc.fullscreenElement).not.toBeNull();
    await exitFullscreen(e);
    expect(e.doc.fullscreenElement).toBeNull();
  });

  it('a refused request (no user gesture…) is reported, exit without full screen is a no-op', async () => {
    const e = env();
    e.doc.documentElement.requestFullscreen = vi.fn(() => Promise.reject(new TypeError('denied')));
    expect(await enterFullscreen(e)).toBe(false);
    await exitFullscreen(e);
    expect(e.doc.exitFullscreen).not.toHaveBeenCalled();
  });
});
