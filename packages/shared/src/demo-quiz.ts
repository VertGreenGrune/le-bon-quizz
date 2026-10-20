import type { Quiz } from './quiz.js';

/** Hardcoded quiz for phase 1 (no database yet). Use quizId 'demo'. */
export const DEMO_QUIZ: Quiz = {
  id: 'demo',
  title: 'Le Bon Quizz — Démo',
  description: 'Un petit quiz pour tester le jeu.',
  questions: [
    {
      text: 'Quelle est la capitale de la France ?',
      type: 'MCQ',
      timeLimitSec: 20,
      basePoints: 1000,
      choices: [
        { text: 'Lyon', isCorrect: false },
        { text: 'Paris', isCorrect: true },
        { text: 'Marseille', isCorrect: false },
        { text: 'Bordeaux', isCorrect: false },
      ],
    },
    {
      text: 'La Terre tourne autour du Soleil.',
      type: 'TRUE_FALSE',
      timeLimitSec: 10,
      basePoints: 1000,
      choices: [
        { text: 'Vrai', isCorrect: true },
        { text: 'Faux', isCorrect: false },
      ],
    },
    {
      text: 'Combien de pattes a une araignée ?',
      type: 'MCQ',
      timeLimitSec: 20,
      basePoints: 2000,
      choices: [
        { text: '6', isCorrect: false },
        { text: '8', isCorrect: true },
        { text: '10', isCorrect: false },
      ],
    },
    {
      text: 'Qui a peint la Joconde ?',
      type: 'MCQ',
      timeLimitSec: 20,
      basePoints: 1000,
      choices: [
        { text: 'Michel-Ange', isCorrect: false },
        { text: 'Raphaël', isCorrect: false },
        { text: 'Léonard de Vinci', isCorrect: true },
        { text: 'Botticelli', isCorrect: false },
      ],
    },
  ],
};
