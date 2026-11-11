import { motion } from 'framer-motion';
import { useState } from 'react';
import type { QuestionShowPayload, RevealDetails } from '@lbq/shared';
import { Avatar } from '../components/Avatar';
import { PinMarker, PinPicture, PinZoneMark } from '../components/PinPicture';
import { mediaUrl } from '../lib/mediaUrl';
import {
  missingFoundLine,
  missingRevealPicture,
  missingStagePicture,
  type MissingSide,
} from '../lib/missing';

/**
 * « Qu'est-ce qui a disparu ? » (T59) on the TV: the picture « avant » while memorizing, « après »
 * (cross-faded) while the phones answer, then « avant » with the zone and every pin, with an
 * avant / après toggle.
 */
export function MissingStage({
  question,
  reveal,
  instant,
}: {
  question: QuestionShowPayload;
  reveal: RevealDetails['missing'];
  instant: boolean;
}) {
  if (reveal) return <MissingReveal reveal={reveal} instant={instant} />;
  const stage = question.missing?.stage ?? 'memo';
  const memo = stage === 'memo';
  const src = missingStagePicture(question);
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3">
      <motion.p
        key={stage}
        initial={instant ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="rounded-full bg-panel px-8 py-2 text-3xl font-black"
        data-testid="missing-stage"
      >
        {memo
          ? '👀 Regardez bien l’image : un élément va disparaître !'
          : '🔍 Quelque chose a disparu ! Touchez l’endroit sur vos téléphones'}
      </motion.p>
      <div className="relative flex min-h-0 justify-center">
        {/* « avant » stays underneath while « après » fades in over it. */}
        {!memo && question.imageUrl && (
          <img
            src={mediaUrl(question.imageUrl)}
            alt=""
            className="absolute inset-0 m-auto max-h-[52vh] max-w-full rounded-xl"
          />
        )}
        {src && (
          <motion.img
            key={stage}
            src={mediaUrl(src)}
            alt=""
            data-testid="missing-picture"
            data-side={memo ? 'avant' : 'apres'}
            initial={instant ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: memo ? 0.4 : 1.2 }}
            className="relative block max-h-[52vh] max-w-full rounded-xl shadow-lg"
          />
        )}
      </div>
    </div>
  );
}

function MissingReveal({
  reveal,
  instant,
}: {
  reveal: NonNullable<RevealDetails['missing']>;
  instant: boolean;
}) {
  const [side, setSide] = useState<MissingSide>('avant');
  return (
    <div className="flex min-h-0 flex-col items-center gap-3" data-testid="missing-reveal">
      <PinPicture
        src={missingRevealPicture(reveal, side)}
        className="overflow-hidden rounded-xl shadow-lg"
        imgClassName="h-[42vh] w-auto max-w-none"
      >
        <motion.span
          initial={instant ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: instant ? 0 : 0.3 }}
        >
          <PinZoneMark zone={reveal.zone} />
        </motion.span>
        {reveal.pins.map((p, i) => (
          <PinMarker key={i} point={p}>
            <motion.span
              initial={instant ? false : { scale: 0, y: -40 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ delay: instant ? 0 : 0.6 + i * 0.12, type: 'spring', stiffness: 300 }}
              className={`block rounded-full ring-4 ${p.correct ? 'ring-answer-green' : 'ring-white'}`}
              title={p.nickname}
            >
              <Avatar id={p.avatar} size="sm" />
            </motion.span>
          </PinMarker>
        ))}
      </PinPicture>
      <div className="flex items-center gap-4">
        <p className="text-2xl font-bold" data-testid="missing-found">
          {missingFoundLine(reveal)}
        </p>
        <div className="flex overflow-hidden rounded-full bg-panel text-lg font-black">
          {(['avant', 'apres'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setSide(v)}
              aria-pressed={side === v}
              className={`px-5 py-1.5 ${side === v ? 'bg-white text-brand' : ''}`}
            >
              {v === 'avant' ? 'Avant' : 'Après'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
