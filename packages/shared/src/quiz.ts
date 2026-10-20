import { z } from 'zod';

export const QuestionType = z.enum(['MCQ', 'TRUE_FALSE']);
export type QuestionType = z.infer<typeof QuestionType>;

export const BasePoints = z.union([z.literal(0), z.literal(1000), z.literal(2000)]);

export const ChoiceSchema = z.object({
  text: z.string().trim().min(1).max(75),
  isCorrect: z.boolean(),
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const QuestionSchema = z
  .object({
    text: z.string().trim().min(1).max(120),
    imageUrl: z.string().url().optional(),
    type: QuestionType.default('MCQ'),
    timeLimitSec: z.number().int().min(5).max(240).default(20),
    basePoints: BasePoints.default(1000),
    choices: z.array(ChoiceSchema).min(2).max(4),
  })
  .refine((q) => q.choices.some((c) => c.isCorrect), {
    message: 'At least one choice must be correct',
    path: ['choices'],
  })
  .refine((q) => q.type !== 'TRUE_FALSE' || q.choices.length === 2, {
    message: 'True/false questions have exactly 2 choices',
    path: ['choices'],
  });
export type Question = z.infer<typeof QuestionSchema>;

export const QuizSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(95),
  description: z.string().max(500).optional(),
  coverImageUrl: z.string().url().optional(),
  questions: z.array(QuestionSchema).min(1).max(100),
});
export type Quiz = z.infer<typeof QuizSchema>;
