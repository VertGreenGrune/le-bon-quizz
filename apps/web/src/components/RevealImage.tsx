import { useEffect, useRef, useState } from 'react';
import type { ImageEffect } from '@lbq/shared';
import { effectFrame, zoomOrigin } from '../lib/imageEffect';

/**
 * A question picture with its reveal effect (blur / zoom / pixelate) at `progress`
 * (0 = unrecognisable, 1 = clear). Used by the host screen and the editor preview.
 */
export function RevealImage({
  src,
  effect,
  progress,
  seed = src,
  className = '',
}: {
  src: string;
  effect?: ImageEffect;
  progress: number;
  /** Picks the zoom point (same seed = same point). */
  seed?: string;
  /** Size of the picture (e.g. max-height); the effect stays inside it. */
  className?: string;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const frame = effectFrame(effect, progress, natural?.w);
  const origin = zoomOrigin(seed);
  const img = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Pixelate: draw the picture into a tiny canvas, shown stretched without smoothing.
  useEffect(() => {
    const el = img.current;
    const c = canvas.current;
    if (!frame.blocks || !el || !c || !natural) return;
    const w = frame.blocks;
    const h = Math.max(1, Math.round((w * natural.h) / natural.w));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    c.getContext('2d')?.drawImage(el, 0, 0, w, h);
  }, [frame.blocks, natural]);

  return (
    <div className={`relative max-w-full overflow-hidden ${className}`} data-testid="reveal-image">
      <img
        ref={img}
        src={src}
        alt=""
        draggable={false}
        onLoad={(e) =>
          setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
        data-effect={effect ?? 'none'}
        className={`block max-h-[inherit] max-w-full ${frame.blocks ? 'invisible' : ''}`}
        style={{
          filter: frame.blurPx > 0 ? `blur(${frame.blurPx.toFixed(1)}px)` : undefined,
          transform: frame.scale !== 1 ? `scale(${frame.scale.toFixed(3)})` : undefined,
          transformOrigin: `${origin.x}% ${origin.y}%`,
          transition: 'filter 120ms linear, transform 120ms linear',
        }}
      />
      {frame.blocks && (
        <canvas
          ref={canvas}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
    </div>
  );
}
