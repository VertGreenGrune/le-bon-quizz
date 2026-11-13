import type { z } from 'zod';
import { QuizSchema, type Quiz } from './quiz.js';

/** A small drawing used as a question picture (no upload needed: the demo works without a DB). */
const svg = (width: number, height: number, body: string): string =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`,
  )}`;

/** « Point sur l'image »: five balloons, the red one at (0.66, 0.34). */
const BALLOONS = svg(
  800,
  500,
  `<rect width="800" height="500" fill="#bfe6ff"/>
  <rect y="430" width="800" height="70" fill="#7cc36b"/>
  ${[
    [140, 230, '#2f6fdf'],
    [300, 140, '#2fae4f'],
    [420, 270, '#f2c200'],
    [528, 170, '#d81e3a'],
    [660, 250, '#8a3fd1'],
  ]
    .map(
      ([x, y, color]) =>
        `<line x1="${x}" y1="${Number(y) + 62}" x2="${x}" y2="430" stroke="#555" stroke-width="2"/>
        <ellipse cx="${x}" cy="${y}" rx="48" ry="62" fill="${color}"/>
        <ellipse cx="${Number(x) - 16}" cy="${Number(y) - 22}" rx="10" ry="16" fill="#fff" opacity="0.45"/>`,
    )
    .join('')}`,
);

/** « Qu'est-ce qui a disparu ? »: a little scene, then the same without the car. */
const scene = (withCar: boolean): string =>
  svg(
    800,
    500,
    `<rect width="800" height="500" fill="#bfe6ff"/>
    <circle cx="680" cy="90" r="50" fill="#ffd23f"/>
    <ellipse cx="250" cy="90" rx="70" ry="28" fill="#fff"/><ellipse cx="300" cy="75" rx="50" ry="30" fill="#fff"/>
    <rect y="360" width="800" height="140" fill="#7cc36b"/>
    <rect x="90" y="230" width="190" height="150" fill="#f4e1c1"/>
    <polygon points="70,235 185,140 300,235" fill="#c0392b"/>
    <rect x="160" y="300" width="45" height="80" fill="#8e5a2b"/>
    <rect x="105" y="260" width="40" height="35" fill="#9fd3ff"/><rect x="225" y="260" width="40" height="35" fill="#9fd3ff"/>
    <rect x="420" y="270" width="26" height="110" fill="#8e5a2b"/><circle cx="433" cy="240" r="62" fill="#2e8b3e"/>
    ${[530, 565, 600].map((x) => `<line x1="${x}" y1="405" x2="${x}" y2="375" stroke="#2e7d32" stroke-width="4"/><circle cx="${x}" cy="370" r="10" fill="#ff7eb6"/>`).join('')}
    ${
      withCar
        ? `<rect x="610" y="400" width="150" height="45" rx="12" fill="#1e5bd8"/>
           <rect x="640" y="372" width="85" height="35" rx="10" fill="#1e5bd8"/>
           <rect x="652" y="379" width="28" height="22" fill="#cfe9ff"/><rect x="688" y="379" width="28" height="22" fill="#cfe9ff"/>
           <circle cx="645" cy="448" r="17" fill="#222"/><circle cx="725" cy="448" r="17" fill="#222"/>`
        : ''
    }`,
  );

/** A flag to recognise (blurred at first). */
const ITALY = svg(
  300,
  200,
  `<rect width="100" height="200" fill="#009246"/><rect x="100" width="100" height="200" fill="#fff"/><rect x="200" width="100" height="200" fill="#ce2b37"/>`,
);

/**
 * The built-in demo (quizId `demo`, works without login): one question of every type, plus the
 * « select all », picture effect, « Buzzer » and « Enchères » options — a tour of the game.
 */
export const DEMO_QUIZ: Quiz = QuizSchema.parse({
  id: 'demo',
  title: 'Le Bon Quizz — Démo',
  description:
    'Un tour de tous les types de questions : choix multiple, curseur, mytho, dessin, patate chaude…',
  questions: [
    {
      text: 'Quelle est la capitale de l’Australie ?',
      type: 'MCQ',
      timeLimitSec: 20,
      choices: [
        { text: 'Sydney', isCorrect: false },
        { text: 'Melbourne', isCorrect: false },
        { text: 'Canberra', isCorrect: true },
        { text: 'Perth', isCorrect: false },
      ],
      explanation: 'Canberra a été construite exprès pour départager Sydney et Melbourne.',
    },
    {
      text: 'La Grande Muraille de Chine se voit à l’œil nu depuis la Lune.',
      type: 'TRUE_FALSE',
      timeLimitSec: 15,
      choices: [
        { text: 'Vrai', isCorrect: false },
        { text: 'Faux', isCorrect: true },
      ],
      explanation:
        'Faux : elle est bien trop étroite. Les astronautes ne la voient pas de la Lune.',
    },
    {
      text: 'Quel est le plus grand océan du monde ?',
      type: 'TYPE_ANSWER',
      timeLimitSec: 25,
      acceptedAnswers: ['Pacifique', 'Océan Pacifique'],
    },
    {
      text: 'Ton dessert préféré ?',
      type: 'POLL',
      timeLimitSec: 15,
      basePoints: 0,
      choices: [
        { text: 'Mousse au chocolat' },
        { text: 'Tarte Tatin' },
        { text: 'Crème brûlée' },
        { text: 'Île flottante' },
      ],
    },
    {
      text: 'En quelle année l’Homme a-t-il marché sur la Lune pour la première fois ?',
      type: 'SLIDER',
      timeLimitSec: 25,
      slider: { min: 1900, max: 2000, step: 1, correct: 1969, margin: 2 },
      explanation: 'Neil Armstrong, le 21 juillet 1969 (heure de Paris), mission Apollo 11.',
    },
    {
      text: 'Lesquels de ces animaux sont des mammifères ?',
      type: 'MCQ',
      timeLimitSec: 25,
      choices: [
        { text: 'Requin', isCorrect: false },
        { text: 'Dauphin', isCorrect: true },
        { text: 'Manchot', isCorrect: false },
        { text: 'Chauve-souris', isCorrect: true },
      ],
      explanation: 'Plusieurs bonnes réponses : il fallait cocher le dauphin ET la chauve-souris.',
    },
    {
      text: 'Range ces animaux du plus léger au plus lourd.',
      type: 'ORDER',
      timeLimitSec: 30,
      items: ['Souris', 'Chat', 'Cheval', 'Éléphant'],
    },
    {
      text: 'Associe chaque animal à son cri.',
      type: 'MATCH',
      timeLimitSec: 40,
      pairs: [
        { left: { text: '🐶 Chien' }, right: { text: 'Il aboie' } },
        { left: { text: '🐱 Chat' }, right: { text: 'Il miaule' } },
        { left: { text: '🦁 Lion' }, right: { text: 'Il rugit' } },
        { left: { text: '🐴 Cheval' }, right: { text: 'Il hennit' } },
      ],
    },
    {
      text: 'Touche le ballon rouge !',
      type: 'PIN',
      timeLimitSec: 20,
      imageUrl: BALLOONS,
      zone: { x: 0.66, y: 0.34, radius: 0.07 },
    },
    {
      text: 'Retiens bien les couleurs de chaque forme…',
      type: 'COLORS',
      memoSec: 10,
      timeLimitSec: 25,
      cells: 6,
    },
    {
      text: 'Qui de nous arrive toujours en retard ?',
      type: 'WHO_OF_US',
      timeLimitSec: 20,
      basePoints: 0,
      majorityBonus: true,
    },
    {
      text: 'De quel pays est ce drapeau ?',
      type: 'MCQ',
      timeLimitSec: 20,
      imageUrl: ITALY,
      imageEffect: 'blur',
      choices: [
        { text: 'Irlande', isCorrect: false },
        { text: 'France', isCorrect: false },
        { text: 'Mexique', isCorrect: false },
        { text: 'Italie', isCorrect: true },
      ],
      explanation: 'Vert, blanc, rouge : l’Italie. L’Irlande a de l’orange à la place du rouge.',
    },
    {
      text: 'Cite les 7 nains de Blanche-Neige !',
      type: 'LIST',
      timeLimitSec: 45,
      items: [
        'Prof | Professeur',
        'Grincheux',
        'Joyeux',
        'Timide',
        'Atchoum',
        'Dormeur',
        'Simplet',
      ],
    },
    {
      text: 'Regarde bien cette image : un élément va disparaître !',
      type: 'MISSING',
      memoSec: 10,
      timeLimitSec: 20,
      imageUrl: scene(true),
      missingImageUrl: scene(false),
      zone: { x: 0.85, y: 0.82, radius: 0.12 },
      explanation: 'C’était la voiture bleue garée en bas à droite.',
    },
    {
      text: 'La poupée Barbie s’appelle en réalité Barbara Millicent… ?',
      type: 'BLUFF',
      timeLimitSec: 45,
      truth: 'Roberts',
      voteTimeSec: 20,
    },
    {
      text: 'Un mot pour décrire tes vacances idéales ?',
      type: 'WORD_CLOUD',
      timeLimitSec: 20,
      basePoints: 0,
    },
    {
      text: 'Cite un fruit… le moins évident possible !',
      type: 'POINTLESS',
      timeLimitSec: 25,
      items: [
        'Pomme',
        'Poire',
        'Banane',
        'Orange',
        'Fraise',
        'Cerise',
        'Raisin',
        'Kiwi',
        'Ananas',
        'Mangue',
        'Pêche',
        'Abricot',
        'Prune',
        'Citron',
        'Pastèque',
        'Melon',
        'Framboise',
        'Myrtille',
        'Mûre',
        'Groseille',
        'Cassis',
        'Figue',
        'Grenade',
        'Litchi',
        'Papaye',
        'Fruit de la passion | Maracuja',
        'Mandarine',
        'Clémentine',
        'Pamplemousse',
        'Nectarine',
        'Kaki',
        'Coing',
        'Goyave',
        'Noix de coco | Coco',
      ],
      explanation: 'Plus ta réponse est rare parmi les joueurs, plus elle rapporte de points.',
    },
    {
      text: 'Buzzez ! Quelle planète surnomme-t-on la planète rouge ?',
      type: 'TYPE_ANSWER',
      timeLimitSec: 20,
      buzzer: true,
      acceptedAnswers: ['Mars'],
    },
    {
      text: 'Combien d’os compte le squelette d’un adulte ?',
      type: 'WAGER',
      timeLimitSec: 25,
      wager: { correct: 206, unit: 'os' },
      betTimeSec: 20,
      explanation: 'Un bébé en a environ 300 : certains se soudent en grandissant.',
    },
    {
      text: 'Dessine-moi !',
      type: 'DRAW',
      timeLimitSec: 60,
    },
    {
      text: 'Sur la même longueur d’onde : où est la cible ?',
      type: 'WAVELENGTH',
      timeLimitSec: 20,
      clueTimeSec: 30,
    },
    {
      text: 'Qui a réalisé le film Jurassic Park (1993) ?',
      type: 'MCQ',
      timeLimitSec: 20,
      auction: true,
      auctionTopic: 'Cinéma',
      choices: [
        { text: 'James Cameron', isCorrect: false },
        { text: 'George Lucas', isCorrect: false },
        { text: 'Steven Spielberg', isCorrect: true },
        { text: 'Ridley Scott', isCorrect: false },
      ],
    },
    {
      text: 'Patate chaude : ne gardez pas la bombe !',
      type: 'HOT_POTATO',
      potato: {
        fuseMinSec: 30,
        fuseMaxSec: 45,
        questions: [
          { text: 'Combien font 2 + 2 × 2 ?', choices: ['6', '8'], correct: 0 },
          { text: 'Capitale de l’Italie ?', choices: ['Milan', 'Rome', 'Venise'], correct: 1 },
          { text: 'Combien de côtés a un triangle ?', choices: ['3', '4'], correct: 0 },
          { text: 'Quel animal fait « miaou » ?', choices: ['Le chien', 'Le chat'], correct: 1 },
          {
            text: 'Planète la plus proche du Soleil ?',
            choices: ['Vénus', 'Mars', 'Mercure'],
            correct: 2,
          },
          { text: 'Le contraire de « chaud » ?', choices: ['Froid', 'Tiède'], correct: 0 },
          { text: 'Combien de jours en février 2024 ?', choices: ['28', '29'], correct: 1 },
          { text: 'Combien de pattes a une araignée ?', choices: ['6', '8', '10'], correct: 1 },
        ],
      },
    },
  ],
} satisfies z.input<typeof QuizSchema>);

/**
 * The first demo (7 classic questions): the fixture of the unit tests and, with
 * `E2E_CLASSIC_DEMO` set on the server, the quiz `demo` of the end-to-end tests.
 */
export const CLASSIC_DEMO_QUIZ: Quiz = {
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
    {
      text: 'Ton dessert préféré ?',
      type: 'POLL',
      timeLimitSec: 20,
      basePoints: 0,
      choices: [
        { text: 'Mousse au chocolat' },
        { text: 'Tarte Tatin' },
        { text: 'Crème brûlée' },
        { text: 'Île flottante' },
      ],
    },
    {
      text: 'Quel est le plus grand océan ?',
      type: 'TYPE_ANSWER',
      timeLimitSec: 30,
      basePoints: 1000,
      acceptedAnswers: ['Pacifique', 'Océan Pacifique'],
      typoTolerance: true,
    },
    {
      text: 'En quelle année a eu lieu la prise de la Bastille ?',
      type: 'SLIDER',
      timeLimitSec: 30,
      basePoints: 1000,
      slider: { min: 1700, max: 1900, step: 1, correct: 1789, margin: 5 },
    },
  ],
};
