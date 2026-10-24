import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
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
import { sendGuess, sendStrokes } from './playerStore';
import type { PlayerState } from './playerState';

/** Points closer than this to the previous one (drawing units) are skipped: smaller messages. */
const MIN_STEP = 3;

/** Draws one stroke (or its last segment) on the canvas, `k` = canvas pixels per drawing unit. */
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
  ctx.beginPath();
  const start = Math.max(0, from - 2);
  ctx.moveTo(p[start]! * k, p[start + 1]! * k);
  for (let i = start + 2; i < p.length; i += 2) ctx.lineTo(p[i]! * k, p[i + 1]! * k);
  ctx.stroke();
}

/**
 * « Dessine-moi », the drawer: the secret word, a 4:3 canvas drawn with the finger, a few colors,
 * three sizes, an eraser and « Tout effacer ». New points are sent every DRAW_FLUSH_MS.
 */
export function DrawerPad({ s }: { s: PlayerState }) {
  const word = s.prompt?.draw?.word ?? '';
  const index = s.questionIndex;
  const [color, setColor] = useState(0);
  const [size, setSize] = useState(1);
  const [eraser, setEraser] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<DrawStroke[]>([]);
  const current = useRef<DrawStroke | null>(null);
  /** Points not sent yet, per stroke id; `clear` = « Tout effacer » not sent yet. */
  const pending = useRef(new Map<number, DrawStroke>());
  const clear = useRef(false);
  const nextId = useRef(0);
  const frozen = !!s.paused;

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
    sendStrokes([...pending.current.values()], clear.current);
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
    redraw();
    // Only a new full re-send (`version`) replaces the local drawing.
  }, [version, redraw]);

  // Canvas size follows its box (sharp on high-density screens).
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fit = () => {
      const w = Math.round(c.clientWidth * (window.devicePixelRatio || 1));
      if (w > 0 && c.width !== w) {
        c.width = w;
        c.height = Math.round((w * DRAW_HEIGHT) / DRAW_WIDTH);
        redraw();
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => {
    const id = setInterval(flush, DRAW_FLUSH_MS);
    return () => {
      clearInterval(id);
      flush();
    };
  }, [flush]);

  const point = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * DRAW_WIDTH);
    const y = Math.round(((e.clientY - r.top) / r.height) * DRAW_HEIGHT);
    return [Math.min(DRAW_WIDTH, Math.max(0, x)), Math.min(DRAW_HEIGHT, Math.max(0, y))];
  };

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
    if (frozen) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const st: DrawStroke = {
      id: nextId.current++,
      color,
      size,
      ...(eraser && { erase: true as const }),
      points: [],
    };
    strokes.current.push(st);
    current.current = st;
    add(st, point(e));
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const st = current.current;
    if (!st || frozen) return;
    const [x, y] = point(e);
    const n = st.points.length;
    if (Math.hypot(x - st.points[n - 2]!, y - st.points[n - 1]!) < MIN_STEP) return;
    add(st, [x, y]);
  };
  const up = () => {
    current.current = null;
    flush();
  };
  const eraseAll = () => {
    strokes.current = [];
    current.current = null;
    pending.current.clear();
    clear.current = true;
    flush();
    redraw();
  };

  const found = s.draw?.found ?? [];
  return (
    <div className="flex flex-1 flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <p className="text-center text-lg font-bold">🎨 C’est toi qui dessines !</p>
      <p
        className="rounded-2xl bg-white px-4 py-2 text-center text-3xl font-black break-words text-brand"
        data-testid="draw-word"
      >
        {word}
      </p>
      <canvas
        ref={canvas}
        data-testid="draw-canvas"
        aria-label={`Zone de dessin : dessine « ${word} »`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className={`aspect-[4/3] w-full touch-none rounded-xl shadow-lg ${frozen ? 'opacity-60' : ''}`}
        style={{ background: DRAW_BACKGROUND }}
      />
      <div className="flex flex-wrap items-center justify-center gap-2" role="toolbar">
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
      <div className="flex items-center justify-center gap-2" role="toolbar">
        {DRAW_SIZES.map((w, i) => (
          <button
            key={w}
            type="button"
            aria-label={['Trait fin', 'Trait moyen', 'Trait épais'][i]}
            aria-pressed={size === i}
            onClick={() => setSize(i)}
            className={`flex size-11 touch-manipulation items-center justify-center rounded-xl ${size === i ? 'bg-white' : 'bg-white/20'}`}
          >
            <span
              className="rounded-full bg-gray-900"
              style={{ width: 4 + i * 6, height: 4 + i * 6 }}
            />
          </button>
        ))}
        <button
          type="button"
          aria-pressed={eraser}
          onClick={() => setEraser((v) => !v)}
          className={`h-11 touch-manipulation rounded-xl px-3 font-black ${eraser ? 'bg-white text-brand' : 'bg-white/20'}`}
        >
          🧽 Gomme
        </button>
        <button
          type="button"
          onClick={eraseAll}
          className="h-11 touch-manipulation rounded-xl bg-answer-red px-3 font-black"
        >
          🗑️ Tout effacer
        </button>
      </div>
      <p className="text-center font-bold" aria-live="polite">
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
