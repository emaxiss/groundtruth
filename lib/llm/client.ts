import OpenAI from 'openai';

import { readEnv } from '../env';

import { LlmError } from './errors';
import { fakeComplete } from './fake';
import { assertModelsAllowed, fallbackModels } from './models';

const TIMEOUT_MS = 60_000;

// Response header naming the model that actually answered, so a caller (and
// the eval harness) can tell a primary answer from a fallback one.
export const MODEL_HEADER = 'x-groundtruth-model';

export type CompleteArgs = { system: string; user: string; jsonMode?: boolean };

// `model` is what the provider reports it served, which can differ from the
// requested model when fallback routing is in play.
export type Completion = { text: string; model: string };

export function isFakeMode(): boolean {
  return readEnv().fakeLlm;
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const { baseUrl: baseURL, apiKey } = readEnv();
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

export async function complete({ system, user, jsonMode }: CompleteArgs): Promise<Completion> {
  if (isFakeMode()) return { text: fakeComplete({ system, user, jsonMode }), model: 'fake' };

  const { model } = readEnv();
  if (!model) throw new LlmError('GROUNDTRUTH_MODEL is not set', 'config');
  const fallbacks = fallbackModels();
  // Checked before the first request, so a misconfiguration fails loudly
  // instead of quietly spending credit.
  assertModelsAllowed([model, ...fallbacks]);

  const routing = [model, ...fallbacks];
  let lastErr: LlmError | null = null;
  // Client-side rotation over the routing list, two passes. Provider-side
  // routing only steps in on some errors; an overloaded upstream answering
  // 200 with no completion, or a timeout, is not one of them. Each attempt
  // asks for the next model and hands the provider the rest of the list.
  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = 0; i < routing.length; i++) {
      if (pass > 0 || i > 0) await sleep(lastErr?.kind === 'rate_limited' ? 2000 : 400);
      try {
        return await request(routing[i], routing.slice(i), { system, user, jsonMode });
      } catch (err) {
        lastErr = err instanceof LlmError ? err : classify(err);
        if (lastErr.kind === 'config') throw lastErr;
      }
    }
  }
  throw lastErr ?? new LlmError('Unknown model failure', 'upstream');
}

const PASSES = 2;

async function request(model: string, models: string[], args: CompleteArgs): Promise<Completion> {
  const res = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
    temperature: 0,
    ...(args.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
    // OpenRouter routes to the next entry when the primary errors or is
    // rate limited. Other providers ignore the field.
    ...(models.length > 1 ? { models } : {}),
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
}
