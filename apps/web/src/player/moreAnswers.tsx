import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { Reorder, motion } from 'framer-motion';
import type { LobbyMember, PinPoint, QuestionPromptPayload } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { PinMarker, PinPicture } from '../components/PinPicture';
import { itemLetter } from '../lib/orderItems';
import type { PlayerState } from './playerState';
import { sendAnswer } from './playerStore';
import { IDENTITY, MAX_SCALE, clampView, zoomAt, type View } from './zoomPan';

/** Phone controllers of the ORDER / PIN / WHO_OF_US questions (word clouds use `TextAnswer`). */

const validateClass =
  'w-full touch-manipulation rounded-2xl bg-answer-green py-4 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50';

/** Remettre dans l'ordre: drag the items (or use ↑ ↓), then « Valider ». */
export function OrderAnswer({ items }: { items: string[] }) {
  // Shown indexes, in the player's order (starts as shown: the same order as on the TV).
  const [order, setOrder] = useState(() => items.map((_, i) => i));
  const move = (from: number, to: number) =>
    setOrder((o) => {
      if (to < 0 || to >= o.length) return o;
      const next = [...o];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  const arrowClass =
    'flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-lg bg-black/10 text-xl font-black active:bg-black/25 disabled:opacity-30';
  return (
    <div className="flex flex-1 flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h2 className="text-center text-2xl font-black">Remets dans l’ordre</h2>
      <p className="-mt-2 text-center text-sm font-semibold opacity-80">
        Fais glisser les éléments, le premier en haut
      </p>
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className="flex flex-col gap-2">
        {order.map((shown, position) => (
          <Reorder.Item
            key={shown}
            value={shown}
            className="flex touch-none items-center gap-2 rounded-2xl bg-white p-2 text-brand shadow"
            whileDrag={{ scale: 1.04, boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}
            data-testid="order-item"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand font-black text-white">
              {itemLetter(shown)}
            </span>
            <span className="min-w-0 flex-1 font-bold break-words">{items[shown]}</span>
            <button
              type="button"
              aria-label={`Monter ${items[shown]}`}
              disabled={position === 0}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => move(position, position - 1)}
              className={arrowClass}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Descendre ${items[shown]}`}
              disabled={position === order.length - 1}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => move(position, position + 1)}
              className={arrowClass}
            >
              ↓
            </button>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={() => sendAnswer({ order })}
        className={`mt-auto ${validateClass}`}
      >
        Valider
      </motion.button>
    </div>
  );
}

/** Moves under this many pixels count as a tap (places the pin), above as a drag (pans). */
const TAP_SLOP_PX = 8;

/**
 * Point sur l'image: tap the picture (tap again to move the pin), then « Valider ». The picture can
 * be zoomed (pinch, ＋ / −, mouse wheel) and moved (drag) to place the point precisely; the point is
 * measured on the picture as shown, so it is the same picture fraction whatever the zoom.
 */
export function PinAnswer({ imageUrl }: { imageUrl: string }) {
  const [point, setPoint] = useState<PinPoint | null>(null);
  const [view, setView] = useState<View>(IDENTITY);
  const viewport = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  // Active pointers and the gesture they started (one finger: tap or pan; two: pinch).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'one'; x: number; y: number; start: View; moved: boolean }
    | { kind: 'pinch'; dist: number; mid: { x: number; y: number }; start: View }
    | null
  >(null);

  const box = () => viewport.current?.getBoundingClientRect();
  const local = (clientX: number, clientY: number) => {
    const r = box();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };
  const zoomBy = (factor: number, cx?: number, cy?: number) => {
    const r = box();
    if (!r) return;
    setView((v) =>
      zoomAt(v, v.scale * factor, cx ?? r.width / 2, cy ?? r.height / 2, r.width, r.height),
    );
  };
  const place = (clientX: number, clientY: number) => {
    const r = picture.current?.getBoundingClientRect(); // includes the zoom / pan
    if (!r || r.width === 0 || r.height === 0) return;
    const f = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000;
    setPoint({ x: f((clientX - r.left) / r.width), y: f((clientY - r.top) / r.height) });
  };

  const twoFingers = () => {
    const [a, b] = [...pointers.current.values()];
    return {
      dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1,
      mid: local((a!.x + b!.x) / 2, (a!.y + b!.y) / 2),
    };
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1)
      gesture.current = { kind: 'one', x: e.clientX, y: e.clientY, start: view, moved: false };
    else if (pointers.current.size === 2)
      gesture.current = { kind: 'pinch', ...twoFingers(), start: view };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const r = box();
    if (!g || !r) return;
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const { dist, mid } = twoFingers();
      // Zoom around where the fingers started, then follow the fingers' middle.
      const zoomed = zoomAt(
        g.start,
        g.start.scale * (dist / g.dist),
        g.mid.x,
        g.mid.y,
        r.width,
        r.height,
      );
      setView(
        clampView(
          { ...zoomed, x: zoomed.x + mid.x - g.mid.x, y: zoomed.y + mid.y - g.mid.y },
          r.width,
          r.height,
        ),
      );
    } else if (g.kind === 'one') {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
      g.moved = true;
      setView(clampView({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }, r.width, r.height));
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (g?.kind === 'one' && !g.moved) place(e.clientX, e.clientY);
    // A pinch never ends with a tap: wait for every finger to lift before a new gesture.
    gesture.current = pointers.current.size === 0 || g?.kind === 'pinch' ? null : g;
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const p = local(e.clientX, e.clientY);
    zoomBy(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
  };

  const zoomed = view.scale > 1.001;
  const zoomButton =
    'grid size-11 place-items-center rounded-full bg-white/90 text-2xl font-black text-brand shadow-lg disabled:opacity-40';
  return (
    <div className="flex flex-1 flex-col items-center gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h2 className="text-center text-2xl font-black">Touche l’image</h2>
      <p className="-mt-2 text-center text-sm opacity-80">
        Pince ou ＋ pour zoomer, glisse pour te déplacer
      </p>
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div
            ref={viewport}
            className="relative inline-flex cursor-crosshair touch-none overflow-hidden rounded-xl shadow-lg select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            data-testid="pin-viewport"
          >
            <div
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                transformOrigin: '0 0',
              }}
            >
              <div ref={picture} className="relative">
                <PinPicture src={imageUrl} imgClassName="max-h-[55vh] max-w-full">
                  {point && <Pin point={point} scale={view.scale} />}
                </PinPicture>
              </div>
            </div>
          </div>
          {/* Under the picture, never over it: every spot of the picture stays tappable. */}
          <div className="flex gap-3">
            <button
              type="button"
              aria-label="Zoomer"
              disabled={view.scale >= MAX_SCALE}
              onClick={() => zoomBy(1.5)}
              className={zoomButton}
            >
              ＋
            </button>
            <button
              type="button"
              aria-label="Dézoomer"
              disabled={!zoomed}
              onClick={() => zoomBy(1 / 1.5)}
              className={zoomButton}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Voir toute l’image"
              disabled={!zoomed}
              onClick={() => setView(IDENTITY)}
              className={zoomButton}
            >
              ⟲
            </button>
          </div>
        </div>
      </div>
      <motion.button
        type="button"
        disabled={!point}
        whileTap={{ scale: 0.95 }}
        onClick={() => point && sendAnswer({ point })}
        className={validateClass}
      >
        {point ? 'Valider' : 'Touche l’image pour placer ton point'}
      </motion.button>
    </div>
  );
}

/** `scale`: zoom of the picture — the mark is counter-scaled to keep its size on screen. */
function Pin({ point, scale = 1 }: { point: PinPoint; scale?: number }) {
  return (
    <PinMarker point={point}>
      <span className="block" style={{ transform: `scale(${1 / scale})` }}>
        <motion.span
          key={`${point.x},${point.y}`}
          initial={{ scale: 2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="block size-7 rounded-full border-4 border-white bg-answer-red shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
          data-testid="pin-mark"
        />
      </span>
    </PinMarker>
  );
}

/** « Qui de nous ? »: one big button per player of the game. */
export function WhoOfUsAnswer({ candidates }: { candidates: LobbyMember[] }) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h2 className="text-center text-2xl font-black">Vote pour quelqu’un</h2>
      <div className="grid grid-cols-2 gap-3">
        {candidates.map((c, i) => (
          <motion.button
            key={c.id}
            type="button"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20, delay: i * 0.04 }}
            onClick={() => sendAnswer({ playerId: c.id })}
            aria-label={`Voter pour ${c.nickname}`}
            className="flex touch-manipulation flex-col items-center gap-2 rounded-2xl bg-white/15 p-3 font-black shadow active:bg-white/30"
          >
            <Avatar id={c.avatar} size="lg" />
            <span className="max-w-full truncate text-lg">{c.nickname}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/** « Réponse envoyée ! » content for these types (null for the others). */
export function MoreAnswered({ s }: { s: PlayerState }) {
  const a = s.myAnswer;
  const prompt: QuestionPromptPayload | null = s.prompt;
  if (!a) return null;
  if ('order' in a && prompt?.items) {
    return (
      <ol className="flex w-full max-w-sm flex-col gap-1.5">
        {a.order.map((shown, i) => (
          <motion.li
            key={shown}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-left font-bold text-brand"
          >
            <span className="font-black">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate">{prompt.items![shown]}</span>
          </motion.li>
        ))}
      </ol>
    );
  }
  if ('point' in a && prompt?.imageUrl) {
    return (
      <PinPicture
        src={prompt.imageUrl}
        className="overflow-hidden rounded-xl"
        imgClassName="max-h-[35vh] max-w-full"
      >
        <Pin point={a.point} />
      </PinPicture>
    );
  }
  if ('playerId' in a) {
    const voted = prompt?.candidates?.find((c) => c.id === a.playerId);
    if (!voted) return null;
    return (
      <motion.div
        initial={{ scale: 1.4, rotate: -6 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 12 }}
        className="flex flex-col items-center gap-2"
      >
        <Avatar id={voted.avatar} size="xl" />
        <span className="text-2xl font-black">{voted.nickname}</span>
      </motion.div>
    );
  }
  return null;
}
