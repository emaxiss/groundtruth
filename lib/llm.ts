import OpenAI from 'openai';

import { fakeComplete } from './fake-llm';

const TIMEOUT_MS = 60_000;

export type CompleteArgs = { system: string; user: string; jsonMode?: boolean };

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

export async function complete({ system, user, jsonMode }: CompleteArgs): Promise<string> {
  if (isFakeMode()) return fakeComplete({ system, user, jsonMode });

  const model = process.env.GROUNDTRUTH_MODEL;
  if (!model) throw new LlmError('GROUNDTRUTH_MODEL is not set', 'config');

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
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (!text) throw new LlmError('Model returned an empty response', 'upstream');
      return text;
    } catch (err) {
      lastErr = err instanceof LlmError ? err : classify(err);
      if (lastErr.kind === 'config') throw lastErr;
    }
  }
  throw lastErr ?? new LlmError('Unknown model failure', 'upstream');
}
