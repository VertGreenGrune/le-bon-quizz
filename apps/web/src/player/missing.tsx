import { motion } from 'framer-motion';

/**
 * « Qu'est-ce qui a disparu ? » (T59), phone, while the TV shows the picture « avant »: nothing of
 * the picture here. Then the usual « point sur l'image » screen on the picture « après ».
 */
export function MissingMemo() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <motion.p
        className="text-8xl"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.4, repeat: Infinity }}
        aria-hidden="true"
      >
        👀
      </motion.p>
      <h2 className="text-3xl leading-tight font-black" data-testid="missing-memo">
        Regarde bien l’image sur l’écran…
      </h2>
      <p className="text-lg font-semibold opacity-85">
        Un élément va disparaître : il faudra toucher l’endroit où il était.
      </p>
    </div>
  );
}
