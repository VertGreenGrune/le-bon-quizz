import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QuizInput } from '@lbq/shared';
import { createPrisma, type PrismaClient } from '../src/db.js';
import { prepareQuiz, saveImportedQuiz, uploadDirStore } from './quizImport.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]);

let dir: string;
let folder: string;
let uploads: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'lbq-import-'));
  folder = path.join(dir, 'quiz');
  uploads = path.join(dir, 'uploads');
  mkdirSync(path.join(folder, 'images'), { recursive: true });
  mkdirSync(path.join(folder, 'audio'));
  writeFileSync(path.join(folder, 'images', 'photo.png'), PNG);
  writeFileSync(path.join(folder, 'audio', 'theme.wav'), WAV);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const writeQuiz = (quiz: object) =>
  writeFileSync(path.join(folder, 'quiz.json'), JSON.stringify(quiz));

const question = (extra: object = {}) => ({
  type: 'MCQ',
  text: 'Question ?',
  choices: [
    { text: 'Oui', isCorrect: true },
    { text: 'Non', isCorrect: false },
  ],
  ...extra,
});

const store = () => uploadDirStore(uploads, 'http://localhost:3001/');

describe('prepareQuiz', () => {
  it('copies local media into the upload dir and rewrites them as URLs', async () => {
    writeQuiz({
      title: 'Quiz',
      coverImageUrl: 'images/photo.png',
      questions: [
        question({ imageUrl: 'images/photo.png', imageEffect: 'blur' }),
        question({ audio: { url: 'audio/theme.wav', startSec: 12, durationSec: 20 } }),
        question({ imageUrl: 'https://example.com/a.jpg' }),
      ],
    });
    const quiz = await prepareQuiz(folder, store());
    const [q1, q2, q3] = quiz.questions;
    expect(quiz.coverImageUrl).toMatch(/^http:\/\/localhost:3001\/uploads\/[0-9a-f]{32}\.png$/);
    expect(q1!.imageUrl).toBe(quiz.coverImageUrl); // same content = same file
    expect(q2!.audio).toEqual({
      url: expect.stringMatching(/\/uploads\/[0-9a-f]{32}\.wav$/),
      startSec: 12,
      durationSec: 20,
    });
    expect(q3!.imageUrl).toBe('https://example.com/a.jpg');
    expect(quiz.visibility).toBe('PRIVATE');
    expect(readdirSync(uploads).sort()).toHaveLength(2);
  });

  it('is idempotent: importing again reuses the same files', async () => {
    writeQuiz({ title: 'Quiz', questions: [question({ imageUrl: 'images/photo.png' })] });
    const a = await prepareQuiz(folder, store());
    const b = await prepareQuiz(folder, store());
    expect(b.questions[0]!.imageUrl).toBe(a.questions[0]!.imageUrl);
    expect(readdirSync(uploads)).toHaveLength(1);
  });

  it('skips a missing sound with a warning', async () => {
    writeQuiz({
      title: 'Quiz',
      questions: [question({ audio: { url: 'audio/absent.mp3' }, audioOnReveal: true })],
    });
    const warnings: string[] = [];
    const quiz = await prepareQuiz(folder, store(), (m) => warnings.push(m));
    expect(quiz.questions[0]!.audio).toBeUndefined();
    expect(quiz.questions[0]!.audioOnReveal).toBeUndefined();
    expect(warnings).toEqual([expect.stringContaining('audio/absent.mp3')]);
  });

  it('skips a missing question picture (and its effect) with a warning', async () => {
    writeQuiz({
      title: 'Quiz',
      questions: [question({ imageUrl: 'images/absent.jpg', imageEffect: 'zoom' })],
    });
    const warnings: string[] = [];
    const quiz = await prepareQuiz(folder, store(), (m) => warnings.push(m));
    expect(quiz.questions[0]!.imageUrl).toBeUndefined();
    expect(quiz.questions[0]!.imageEffect).toBeUndefined();
    expect(warnings).toEqual([expect.stringContaining('images/absent.jpg')]);
  });

  it('fails on a missing cover or PIN picture, an unknown format or an invalid quiz', async () => {
    writeQuiz({ title: 'Quiz', coverImageUrl: 'images/absent.jpg', questions: [question()] });
    await expect(prepareQuiz(folder, store())).rejects.toThrow('images/absent.jpg');

    writeQuiz({
      title: 'Quiz',
      questions: [
        {
          type: 'PIN',
          text: 'Où ?',
          imageUrl: 'images/carte.jpg',
          zone: { x: 0.5, y: 0.5, radius: 0.1 },
        },
      ],
    });
    await expect(prepareQuiz(folder, store(), () => {})).rejects.toThrow('images/carte.jpg');

    writeQuiz({ title: 'Quiz', questions: [question({ imageUrl: 'audio/theme.wav' })] });
    await expect(prepareQuiz(folder, store())).rejects.toThrow('non reconnu');

    writeQuiz({ title: 'Quiz', questions: [question({ choices: [] })] });
    await expect(prepareQuiz(folder, store())).rejects.toThrow('questions.0.choices');
  });

  it('forces the quiz to private', async () => {
    writeQuiz({ title: 'Quiz', visibility: 'PUBLIC', questions: [question()] });
    expect((await prepareQuiz(folder, store())).visibility).toBe('PRIVATE');
    expect(existsSync(uploads)).toBe(false);
  });
});

const importInput = (questions: object[]) =>
  QuizInput.parse({ title: 'Import', visibility: 'PRIVATE', questions });

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)('saveImportedQuiz (Postgres)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    execSync('pnpm exec prisma migrate deploy', {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'ignore',
    });
    prisma = createPrisma(TEST_DATABASE_URL);
  }, 60_000);
  afterAll(() => prisma?.$disconnect());
  beforeEach(() => prisma.$executeRawUnsafe('TRUNCATE "User", "Quiz", "GameSession" CASCADE'));

  it('creates the quiz for the host, then updates it in place', async () => {
    const owner = await prisma.user.create({
      data: { email: 'host@test.fr', name: 'Host', passwordHash: 'x' },
    });
    const first = await saveImportedQuiz(prisma, 'Host@Test.fr', importInput([question()]));
    expect(first.created).toBe(true);

    const second = await saveImportedQuiz(
      prisma,
      'host@test.fr',
      importInput([question(), question({ text: 'Deux ?', basePoints: 2000 })]),
    );
    expect(second).toMatchObject({ created: false, quiz: { id: first.quiz.id } });
    expect(second.quiz.questions).toHaveLength(2);
    expect(await prisma.quiz.count({ where: { ownerId: owner.id } })).toBe(1);
    expect(second.quiz.visibility).toBe('PRIVATE');
  });

  it('fails for an unknown host', async () => {
    await expect(
      saveImportedQuiz(prisma, 'nobody@test.fr', importInput([question()])),
    ).rejects.toThrow('nobody@test.fr');
  });
});
