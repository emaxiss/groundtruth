import { z } from 'zod';

export const ChatInput = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message must be 2000 characters or fewer'),
});
export type ChatInput = z.infer<typeof ChatInput>;

export type ApiError = {
  error: string;
  kind: 'validation' | 'rate_limited' | 'timeout' | 'upstream' | 'config' | 'schema';
  details?: unknown;
};

// The client parses responses rather than trusting them: fetch yields `any`,
// and an API contract change should surface as a handled error rather than an
// undefined rendered into the transcript.
export const ChatResponse = z.object({
  answer: z.string(),
  disclaimer: z.string(),
});
export type ChatResponse = z.infer<typeof ChatResponse>;

export const ApiErrorResponse = z.object({
  error: z.string(),
  kind: z.string().optional(),
  details: z.unknown().optional(),
});

export const HealthResponse = z.object({
  fake_llm: z.boolean(),
  model: z.string().nullable(),
  corpus_docs: z.number(),
  grounding_tokens: z.number(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
