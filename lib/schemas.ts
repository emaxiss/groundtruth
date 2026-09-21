import { z } from 'zod';

import { LIMITS } from './limits';

export const ChatInput = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(LIMITS.message, `Message must be ${LIMITS.message} characters or fewer`),
});
export type ChatInput = z.infer<typeof ChatInput>;

export const CUSTOMER_PLANS = ['free', 'pro', 'team'] as const;

export const TriageInput = z.object({
  subject: z
    .string()
    .trim()
    .min(1, 'Subject cannot be empty')
    .max(LIMITS.subject, `Subject must be ${LIMITS.subject} characters or fewer`),
  body: z
    .string()
    .trim()
    .min(1, 'Body cannot be empty')
    .max(LIMITS.body, `Body must be ${LIMITS.body} characters or fewer`),
  customer_plan: z.enum(CUSTOMER_PLANS),
});
export type TriageInput = z.infer<typeof TriageInput>;

// Mirrors the classification contract in lib/prompts.ts. The model is told to
// produce this shape; this is what decides whether it actually did. Anything
// outside these unions is a schema failure, not a low-confidence answer.
export const TriageOutput = z.object({
  category: z.enum(['billing', 'bug', 'how_to', 'feature_request', 'account', 'abuse']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  route_to: z.enum(['support_l1', 'support_l2', 'engineering', 'billing_team', 'trust_safety']),
  refund_eligible: z.union([z.boolean(), z.literal('needs_review')]),
  suggested_reply: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
});
export type TriageOutput = z.infer<typeof TriageOutput>;

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
  paid_models_allowed: z.boolean(),
  all_models_free: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
