import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  DRAW_BACKGROUND,
  DRAW_CHUNK_MAX_POINTS,
  DRAW_COLORS,
  DRAW_COLOR_NAMES,
  DRAW_FLUSH_MS,
  DRAW_HEIGHT,
  DRAW_SIZES,
  DRAW_WIDTH,
  strokeStyle,
  type DrawStroke,
  type PlayerResultPayload,
} from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { drawMessages, smoothSegments } from '../lib/drawing';
import { allowRotation } from '../lib/fullscreen';
import { sendGuess, sendStrokes } from './playerStore';
import type { PlayerState } from './playerState';

/** Points closer than this to the previous one (drawing units) are skipped: smaller messages. */
const MIN_STEP = 3;
/** A touch wider than this (CSS px) is a palm resting on the screen, not a finger: ignored. */
const PALM_SIZE = 70;

/**
 * Draws one stroke on the canvas, smoothed (`smoothSegments`, same curves as the TV), `k` =
 * canvas pixels per drawing unit; `from` = index in `points` of the first value not painted yet.
 */
function paint(ctx: CanvasRenderingContext2D, s: DrawStroke, k: number, from = 0) {
  const { color, width } = strokeStyle(s);
  const p = s.points;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width * k;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0]! * k, p[1]! * k, (width * k) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const { move, curves, end } = smoothSegments(p, from / 2);
  ctx.beginPath();
  ctx.moveTo(move[0] * k, move[1] * k);
  for (const [cx, cy, x, y] of curves) ctx.quadraticCurveTo(cx * k, cy * k, x * k, y * k);
  ctx.lineTo(end[0] * k, end[1] * k);
  ctx.stroke();
}

/** What « Annuler » undoes: a stroke (by id), or a « Tout effacer » (the strokes it removed). */
type Undo = { stroke: number } | { cleared: DrawStroke[] };

/** Grid of the pad: word / pad / tools / status stacked, or the pad on the left when sideways. */
const LAYOUT = [
  'grid min-h-0 flex-1 gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
  "[grid-template-areas:'word'_'pad'_'tools'_'status'] grid-rows-[auto_minmax(0,1fr)_auto_auto]",
  "landscape:[grid-template-areas:'pad_word'_'pad_tools'_'pad_status']",
  'landscape:grid-cols-[minmax(0,1fr)_auto] landscape:grid-rows-[auto_auto_minmax(0,1fr)]',
  'landscape:p-2 landscape:pl-[max(0.5rem,env(safe-area-inset-left))]',
  'landscape:pr-[max(0.5rem,env(safe-area-inset-right))]',
].join(' ');
const TOOL = 'flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl';

/**
 * « Dessine-moi », the drawer: the secret word, a 4:3 canvas drawn with the finger (as big as the
 * screen allows; phone held sideways = tools on the side, a much bigger pad), a few colors,
 * three sizes, undo, an eraser and « Tout effacer ». New points are sent every DRAW_FLUSH_MS.
 */
export function DrawerPad({ s, timer }: { s: PlayerState; timer?: ReactNode }) {
  const word = s.prompt?.draw?.word ?? '';
  const index = s.questionIndex;
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(1);
  const [eraser, setEraser] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<DrawStroke[]>([]);
  const current = useRef<{ stroke: DrawStroke; pointer: number } | null>(null);
  const history = useRef<Undo[]>([]);
  /** Points not sent yet, per stroke id; `clear` = « Tout effacer » not sent yet. */
  const pending = useRef(new Map<number, DrawStroke>());
  const clear = useRef(false);
  const nextId = useRef(0);
  const frozen = !!s.paused;

  // Turning the phone sideways is allowed while drawing (full screen locks portrait otherwise).
  useEffect(() => allowRotation(), []);

  const scale = () => (canvas.current ? canvas.current.width / DRAW_WIDTH : 1);
  const redraw = useCallback(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = DRAW_BACKGROUND;
    ctx.fillRect(0, 0, c.width, c.height);
    for (const st of strokes.current) paint(ctx, st, c.width / DRAW_WIDTH);
  }, []);

  const flush = useCallback(() => {
    if (!clear.current && pending.current.size === 0) return;
    for (const m of drawMessages([...pending.current.values()], clear.current))
      sendStrokes(m.strokes, m.clear);
    pending.current.clear();
    clear.current = false;
  }, []);

  // The server's drawing (rejoin): it is the truth, start from it.
  const drawing = s.drawing?.index === index ? s.drawing : null;
  const version = drawing?.version;
  useEffect(() => {
    if (!drawing) return;
    strokes.current = drawing.strokes.map((st) => ({ ...st, points: [...st.points] }));
    nextId.current = Math.max(nextId.current, ...drawing.strokes.map((st) => st.id + 1));
    pending.current.clear();
    history.current = [];
    setCanUndo(false);
    redraw();
    // Only a new full re-send (`version`) replaces the local drawing.
  }, [version, redraw]);

  // The pad is the biggest 4:3 rectangle that fits its area (portrait or landscape).
  useEffect(() => {
    const a = area.current;
    if (!a) return;
    const measure = () => {
      const w = Math.floor(Math.min(a.clientWidth, (a.clientHeight * DRAW_WIDTH) / DRAW_HEIGHT));
      setBox((b) => (b.w === w ? b : { w, h: Math.floor((w * DRAW_HEIGHT) / DRAW_WIDTH) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(a);
    return () => ro.disconnect();
  }, []);

  // Canvas pixels follow its size (sharp on high-density screens).
  useEffect(() => {
    const c = canvas.current;
    if (!c || box.w === 0) return;
    const w = Math.round(box.w * (window.devicePixelRatio || 1));
    if (c.width !== w) {
      c.width = w;
      c.height = Math.round((w * DRAW_HEIGHT) / DRAW_WIDTH);
    }
    redraw();
  }, [box, redraw]);

  useEffect(() => {
    const id = setInterval(flush, DRAW_FLUSH_MS);
    return () => {
      clearInterval(id);
      flush();
    };
  }, [flush]);

  const point = (x: number, y: number, r: DOMRect): [number, number] => [
    Math.min(DRAW_WIDTH, Math.max(0, Math.round(((x - r.left) / r.width) * DRAW_WIDTH))),
    Math.min(DRAW_HEIGHT, Math.max(0, Math.round(((y - r.top) / r.height) * DRAW_HEIGHT))),
  ];

  /** Adds points to the current stroke, its pending chunk and the canvas. */
  const add = (st: DrawStroke, pts: number[]) => {
    const from = st.points.length;
    st.points.push(...pts);
    let chunk = pending.current.get(st.id);
    if (!chunk) {
      chunk = { ...st, points: [] };
      pending.current.set(st.id, chunk);
    }
    chunk.points.push(...pts);
    if (chunk.points.length >= DRAW_CHUNK_MAX_POINTS * 2) flush();
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paint(ctx, st, scale(), from);
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // One finger draws; a second finger or a resting palm is ignored.
    if (frozen || current.current || !e.isPrimary) return;
    if (e.pointerType === 'touch' && Math.max(e.width, e.height) > PALM_SIZE) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const st: DrawStroke = {
      id: nextId.current++,
      color,
      size,
      ...(eraser && { erase: true as const }),
      points: [],
    };
    strokes.current.push(st);
    current.current = { stroke: st, pointer: e.pointerId };
    history.current.push({ stroke: st.id });
    setCanUndo(true);
    add(st, point(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()));
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const cur = current.current;
    if (!cur || cur.pointer !== e.pointerId || frozen) return;
    const st = cur.stroke;
    const r = e.currentTarget.getBoundingClientRect();
    // Every position since the last event (fast strokes stay round instead of angular).
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const pts: number[] = [];
    let lx = st.points[st.points.length - 2]!;
    let ly = st.points[st.points.length - 1]!;
    for (const ev of events.length > 0 ? events : [e.nativeEvent]) {
      const [x, y] = point(ev.clientX, ev.clientY, r);
      if (Math.hypot(x - lx, y - ly) < MIN_STEP) continue;
      pts.push(x, y);
      lx = x;
      ly = y;
    }
    if (pts.length > 0) add(st, pts);
  };
  const up = (e: PointerEvent<HTMLCanvasElement>) => {
    if (current.current?.pointer !== e.pointerId) return;
    current.current = null;
    flush();
  };
  const eraseAll = () => {
    if (strokes.current.length > 0) {
      history.current.push({ cleared: strokes.current });
      setCanUndo(true);
    }
    strokes.current = [];
    current.current = null;
    pending.current.clear();
    clear.current = true;
    flush();
    redraw();
  };
  /** Removes the last stroke (or brings back a « Tout effacer ») and re-sends the drawing. */
  const undo = () => {
    const last = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!last) return;
    current.current = null;
    if ('stroke' in last) strokes.current = strokes.current.filter((st) => st.id !== last.stroke);
    else strokes.current = [...last.cleared, ...strokes.current];
    clear.current = true;
    pending.current = new Map(
      strokes.current.map((st) => [st.id, { ...st, points: [...st.points] }]),
    );
    flush();
    redraw();
  };

  const found = s.draw?.found ?? [];
  return (
    <div className={LAYOUT}>
      <div className="flex flex-col gap-1 [grid-area:word] landscape:w-48">
        <p className="flex items-center justify-center gap-2 text-sm font-bold">
          🎨 C’est toi qui dessines !
          {timer && <span className="hidden landscape:inline">{timer}</span>}
        </p>
        <p
          className="rounded-2xl bg-white px-3 py-1.5 text-center text-2xl font-black break-words text-brand"
          data-testid="draw-word"
        >
          {word}
        </p>
        <p className="text-center text-xs font-semibold opacity-80 landscape:hidden">
          🔄 Tourne ton téléphone pour dessiner en grand
        </p>
      </div>
      <div ref={area} className="flex min-h-0 min-w-0 items-center justify-center [grid-area:pad]">
        <canvas
          ref={canvas}
          data-testid="draw-canvas"
          aria-label={`Zone de dessin : dessine « ${word} »`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className={`touch-none rounded-xl shadow-lg ${frozen ? 'opacity-60' : ''}`}
          style={{ background: DRAW_BACKGROUND, width: box.w, height: box.h }}
        />
      </div>
      <div className="flex flex-col items-center gap-2 [grid-area:tools] landscape:w-48">
        <div
          className="grid grid-cols-8 gap-1.5 landscape:grid-cols-4"
          role="toolbar"
          aria-label="Couleurs"
        >
          {DRAW_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              aria-label={DRAW_COLOR_NAMES[i]}
              aria-pressed={!eraser && color === i}
              onClick={() => {
                setColor(i);
                setEraser(false);
              }}
              className={`size-9 touch-manipulation rounded-full border-2 ${!eraser && color === i ? 'scale-110 border-white ring-2 ring-white' : 'border-white/40'}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <div
          className="flex flex-wrap items-center justify-center gap-1.5"
          role="toolbar"
          aria-label="Outils"
        >
          {DRAW_SIZES.map((w, i) => (
            <button
              key={w}
              type="button"
              aria-label={['Trait fin', 'Trait moyen', 'Trait épais'][i]}
              aria-pressed={size === i}
              onClick={() => setSize(i)}
              className={`${TOOL} ${size === i ? 'bg-white' : 'bg-white/20'}`}
            >
              <span
                className="rounded-full bg-gray-900"
                style={{ width: 4 + i * 6, height: 4 + i * 6 }}
              />
            </button>
          ))}
          <button
            type="button"
            aria-label="Annuler le dernier trait"
            title="Annuler le dernier trait"
            disabled={!canUndo}
            onClick={undo}
            className={`${TOOL} bg-white/20 disabled:opacity-40`}
          >
            <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
              <path
                d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Gomme"
            title="Gomme"
            aria-pressed={eraser}
            onClick={() => setEraser((v) => !v)}
            className={`${TOOL} text-2xl ${eraser ? 'bg-white' : 'bg-white/20'}`}
          >
            🧽
          </button>
          <button
            type="button"
            aria-label="Tout effacer"
            title="Tout effacer"
            onClick={eraseAll}
            className={`${TOOL} bg-answer-red text-2xl`}
          >
            🗑️
          </button>
        </div>
      </div>
      <p
        className="text-center text-sm font-bold [grid-area:status] landscape:w-48"
        aria-live="polite"
      >
        {found.length === 0
          ? 'Les autres devinent sur leur téléphone…'
          : `✅ ${found.map((p) => p.nickname).join(', ')} ${found.length > 1 ? 'ont' : 'a'} trouvé !`}
      </p>
    </div>
  );
}

/** « Dessine-moi », the others: guess the word drawn on the TV (as many tries as needed). */
export function GuessPad({ s }: { s: PlayerState }) {
  const draw = s.prompt!.draw!;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'close' | 'wrong'; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const guess = text.trim();
  const found = s.draw?.found.length ?? 0;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!guess || busy) return;
        setBusy(true);
        const res = await sendGuess(guess);
        setBusy(false);
        if ('error' in res) {
          setFeedback({ kind: 'wrong', text: res.error });
          return;
        }
        if (res.guess === 'found') return; // the « Trouvé ! » screen takes over
        setFeedback({
          kind: res.guess,
          text: res.guess === 'close' ? `Presque ! « ${guess} »` : `Non, pas « ${guess} »…`,
        });
        setText('');
        input.current?.focus();
      }}
      className="flex flex-1 flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <p className="flex items-center justify-center gap-2 text-center text-lg font-bold">
        {draw.drawer && <Avatar id={draw.drawer.avatar} size="sm" />}
        {draw.drawer ? `${draw.drawer.nickname} dessine` : 'Dessin'} — regarde l’écran !
      </p>
      <h2 className="text-center text-2xl font-black">Qu’est-ce que c’est ?</h2>
      <p
        className="text-center font-mono text-3xl font-black tracking-[0.25em]"
        aria-label={`Mot de ${draw.hint.replace(/[^_]/g, '').length} lettres`}
      >
        {draw.hint}
      </p>
      <input
        ref={input}
        value={text}
        maxLength={draw.maxLength}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ta proposition…"
        aria-label="Ta proposition"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="send"
        className="rounded-2xl bg-white px-4 py-4 text-center text-2xl font-black text-brand outline-none placeholder:text-brand/40"
      />
      {feedback && (
        <motion.p
          key={feedback.text}
          role="status"
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, x: feedback.kind === 'wrong' ? [0, -8, 8, 0] : 0 }}
          className={`rounded-xl px-3 py-2 text-center text-xl font-black ${feedback.kind === 'close' ? 'bg-answer-yellow' : 'bg-answer-red'}`}
          data-testid="guess-feedback"
        >
          {feedback.text}
        </motion.p>
      )}
      <motion.button
        type="submit"
        disabled={!guess || busy}
        whileTap={{ scale: 0.95 }}
        className="touch-manipulation rounded-2xl bg-answer-green py-4 text-2xl font-black shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
      >
        Proposer
      </motion.button>
      {found > 0 && (
        <p className="text-center font-bold opacity-85">
          {found} joueur{found > 1 ? 's ont' : ' a'} déjà trouvé !
        </p>
      )}
    </form>
  );
}

/** « Dessine-moi »: the word was found (other players' guesses stay secret). */
export function DrawFound({ s }: { s: PlayerState }) {
  const a = s.myAnswer;
  const word = a?.questionIndex === s.questionIndex && 'text' in a ? a.text : null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <motion.p
        initial={{ scale: 0.3, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 12 }}
        className="text-8xl"
        aria-hidden="true"
      >
        🎉
      </motion.p>
      <h2 className="text-3xl font-black">Trouvé !</h2>
      {word && (
        <p className="max-w-full break-words rounded-2xl bg-white px-6 py-4 text-3xl font-black text-brand">
          « {word} »
        </p>
      )}
      <p className="text-lg font-semibold opacity-85">Chut ! On attend les autres…</p>
    </div>
  );
}

/** Get-ready screen of a « Dessine-moi »: who draws. */
export function DrawGetReady({ s }: { s: PlayerState }) {
  const drawer = s.draw?.drawer;
  if (!drawer) return null;
  const me = drawer.id === s.playerId;
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-black/25 px-4 py-3 text-xl font-black">
      <span aria-hidden="true">🎨</span>
      {me ? (
        'C’est toi qui dessines ! Ton mot arrive…'
      ) : (
        <>
          <Avatar id={drawer.avatar} size="sm" />
          {drawer.nickname} va dessiner : devine !
        </>
      )}
    </p>
  );
}

type DrawResult = NonNullable<PlayerResultPayload['draw']>;

export function drawResultTitle(draw: DrawResult): string {
  if (draw.drew) return draw.finders > 0 ? 'Bien dessiné !' : 'Personne n’a trouvé…';
  return draw.found ? 'Trouvé !' : 'Pas trouvé !';
}

/** Result lines of a « Dessine-moi »: the word, and for the drawer how many found it. */
export function DrawResultLines({ draw }: { draw: DrawResult }) {
  return (
    <>
      <p className="font-bold">Le mot était « {draw.word} »</p>
      {draw.drew && (
        <p className="font-bold">
          {draw.finders === 0
            ? 'Personne n’a reconnu ton dessin'
            : `${draw.finders} joueur${draw.finders > 1 ? 's ont' : ' a'} reconnu ton dessin !`}
        </p>
      )}
    </>
  );
}
