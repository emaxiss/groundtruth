import OpenAI from 'openai';

import { fakeComplete } from './fake-llm';

const TIMEOUT_MS = 60_000;

// Response header naming the model that actually answered, so a caller (and
// the eval harness) can tell a primary answer from a fallback one.
export const MODEL_HEADER = 'x-groundtruth-model';

export type CompleteArgs = { system: string; user: string; jsonMode?: boolean };

// `model` is what the provider reports it served, which can differ from the
// requested model when fallback routing is in play.
export type Completion = { text: string; model: string };

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: 'rate_limited' | 'timeout' | 'upstream' | 'config',
    readonly status?: number
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export function isFakeMode(): boolean {
  return process.env.GROUNDTRUTH_FAKE_LLM === '1';
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const baseURL = process.env.GROUNDTRUTH_BASE_URL;
  const apiKey = process.env.GROUNDTRUTH_API_KEY;
  if (!baseURL) throw new LlmError('GROUNDTRUTH_BASE_URL is not set', 'config');
  if (!apiKey) throw new LlmError('GROUNDTRUTH_API_KEY is not set', 'config');
  client = new OpenAI({ baseURL, apiKey, timeout: TIMEOUT_MS, maxRetries: 0 });
  return client;
}

function classify(err: unknown): LlmError {
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : String(err);
  if (status === 429) return new LlmError(`Provider rate limited: ${msg}`, 'rate_limited', 429);
  if ((err as { name?: string })?.name === 'APIConnectionTimeoutError')
    return new LlmError(`Model timed out after ${TIMEOUT_MS}ms`, 'timeout');
  return new LlmError(`Upstream model error: ${msg}`, 'upstream', status);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function fallbackModels(): string[] {
  return (process.env.GROUNDTRUTH_FALLBACK_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

export async function complete({ system, user, jsonMode }: CompleteArgs): Promise<Completion> {
  if (isFakeMode()) return { text: fakeComplete({ system, user, jsonMode }), model: 'fake' };

  const model = process.env.GROUNDTRUTH_MODEL;
  if (!model) throw new LlmError('GROUNDTRUTH_MODEL is not set', 'config');
  const fallbacks = fallbackModels();

  let lastErr: LlmError | null = null;
  // One retry. Rate limits get a longer backoff since free-tier ceilings are
  // per-minute; retrying immediately would just burn the second attempt.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(lastErr?.kind === 'rate_limited' ? 2000 : 400);
    try {
      const res = await getClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
        ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
        // OpenRouter routes to the next entry when the primary errors or is
        // rate limited. Other providers ignore the field.
        ...(fallbacks.length > 0 ? { models: [model, ...fallbacks] } : {}),
      } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
      // A provider can return 200 with an error payload and no `choices` at
      // all (upstream capacity errors surface this way through routing), so
      // this cannot assume the documented shape.
      const choices: unknown = (res as { choices?: unknown }).choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        const detail = (res as { error?: { message?: string } }).error?.message;
        throw new LlmError(`Model returned no choices${detail ? `: ${detail}` : ''}`, 'upstream');
      }
      const text = res.choices[0]?.message?.content?.trim();
      if (!text) throw new LlmError('Model returned an empty response', 'upstream');
      return { text, model: res.model || model };
    } catch (err) {
      lastErr = err instanceof LlmError ? err : classify(err);
      if (lastErr.kind === 'config') throw lastErr;
    }
  }
  throw lastErr ?? new LlmError('Unknown model failure', 'upstream');
}
