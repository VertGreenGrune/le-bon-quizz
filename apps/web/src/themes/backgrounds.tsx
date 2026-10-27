import type { CSSProperties, ReactNode } from 'react';
import type { QuizTheme } from '@lbq/shared';

/**
 * Animated background layer of a theme (`themes.css`): at most 30 elements, CSS transforms /
 * opacity only (cheap on a low-end TV, paused by the browser in a hidden tab), moving pieces
 * hidden with `prefers-reduced-motion`. `light` = half the particles (phones).
 */
export function ThemeBackground({ theme, light = false }: { theme: QuizTheme; light?: boolean }) {
  const layer = LAYERS[theme];
  if (!layer) return null;
  return (
    <div
      className="theme-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
      data-testid="theme-background"
    >
      {layer(light)}
    </div>
  );
}

/** Deterministic "random" in [0, 1) so the layout is the same on every render. */
function rand(i: number, k: number): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const css = (style: Record<string, string | number>) => style as CSSProperties;

const LAYERS: Partial<Record<QuizTheme, (light: boolean) => ReactNode>> = {
  halloween: (light) => (
    <>
      <div className="hw-fog theme-moving" style={css({ bottom: '-6vh', '--dur': '70s' })} />
      <div
        className="hw-fog theme-moving"
        style={css({ bottom: '12vh', opacity: 0.18, '--dur': '110s' })}
      />
      {range(light ? 2 : 5).map((i) => (
        <span
          key={i}
          className="hw-bat theme-moving"
          style={css({
            top: `${8 + rand(i, 1) * 45}%`,
            fontSize: `${1.6 + rand(i, 2) * 1.6}rem`,
            '--dur': `${16 + rand(i, 3) * 14}s`,
            animationDelay: `${-rand(i, 4) * 30}s`,
          })}
        >
          🦇
        </span>
      ))}
      {[
        { left: '2%', size: 4.5 },
        { left: '91%', size: 4 },
        { left: '84%', size: 2.6 },
      ]
        .slice(0, light ? 2 : 3)
        .map((p, i) => (
          <span
            key={i}
            className="hw-pumpkin"
            style={css({ left: p.left, fontSize: `${p.size}rem`, animationDelay: `${-i * 0.7}s` })}
          >
            🎃
          </span>
        ))}
    </>
  ),

  christmas: (light) => (
    <>
      <div className="xm-garland">
        {range(light ? 6 : 10).map((i, _, all) => (
          <span
            key={i}
            className="xm-light"
            style={css({
              left: `${((i + 0.5) / all.length) * 100}%`,
              top: `${i % 2 ? 0.45 : 0.1}rem`,
              background: ['#ff4d4d', '#f6c445', '#4ade80', '#60a5fa'][i % 4]!,
              color: ['#ff4d4d', '#f6c445', '#4ade80', '#60a5fa'][i % 4]!,
              animationDelay: `${-(i % 3) * 0.6}s`,
            })}
          />
        ))}
      </div>
      {range(light ? 10 : 20).map((i) => (
        <span
          key={i}
          className="xm-snow theme-moving"
          style={css({
            left: `${rand(i, 1) * 100}%`,
            width: `${4 + rand(i, 2) * 7}px`,
            height: `${4 + rand(i, 2) * 7}px`,
            opacity: 0.5 + rand(i, 3) * 0.5,
            '--drift': `${(rand(i, 4) - 0.5) * 16}vw`,
            '--dur': `${10 + rand(i, 5) * 12}s`,
            animationDelay: `${-rand(i, 6) * 22}s`,
          })}
        />
      ))}
    </>
  ),

  retro: () => (
    <>
      <div className="rt-sun" />
      <div className="rt-floor">
        <div className="rt-grid" />
      </div>
      <div className="rt-scanlines" />
    </>
  ),

  space: (light) => (
    <>
      {range(light ? 14 : 26).map((i) => (
        <span
          key={i}
          className="sp-star"
          style={css({
            left: `${rand(i, 1) * 100}%`,
            top: `${rand(i, 2) * 100}%`,
            width: `${1.5 + rand(i, 3) * 2.5}px`,
            height: `${1.5 + rand(i, 3) * 2.5}px`,
            '--dur': `${2 + rand(i, 4) * 4}s`,
            animationDelay: `${-rand(i, 5) * 6}s`,
          })}
        />
      ))}
      <div className="sp-planet" />
      {!light && <span className="sp-shooting theme-moving" />}
    </>
  ),
};
