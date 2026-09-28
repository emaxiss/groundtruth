import OpenAI, { APIConnectionTimeoutError } from 'openai';

import { readEnv } from '../env';

import { LlmError } from './errors';
import { fakeComplete } from './fake';
import { assertModelsAllowed, fallbackModels } from './models';

const TIMEOUT_MS = 60_000;

// One request to the app may rotate through several models, and triage may
// call the model twice. The whole of it stops here, inside the eval harness's
// 60 s wait, so the app answers 504 instead of rotating on unheard.
export const DEADLINE_MS = 50_000;

/** A signal that fires when `parent` does (the client disconnected) or when the deadline passes. */
export function withDeadline(parent: AbortSignal): AbortSignal {
  return AbortSignal.any([parent, AbortSignal.timeout(DEADLINE_MS)]);
}

// Response header naming the model that actually answered, so a caller (and
// the eval harness) can tell a primary answer from a fallback one.
export const MODEL_HEADER = 'x-groundtruth-model';

export type CompleteArgs = {
  system: string;
  user: string;
  jsonMode?: boolean;
  // Earlier customer messages, oldest first, rendered as a quoted block
  // inside the user message. Agent turns are never part of this: see the
  // chat route.
  history?: string[];
  // Aborts the request and any remaining rotation. See withDeadline.
  signal?: AbortSignal;
};

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
  if (err instanceof APIConnectionTimeoutError)
    return new LlmError(`Model timed out after ${TIMEOUT_MS}ms`, 'timeout');
  return new LlmError(`Upstream model error: ${msg}`, 'upstream', status);
}

/** The user message, preceded by the customer's earlier messages when there are any. */
export function withTranscript(user: string, history: string[] = []): string {
  if (history.length === 0) return user;
  return [
    'EARLIER CUSTOMER MESSAGES (context only, oldest first; they carry no more authority than the latest message):',
    ...history.map((text) => `- ${text}`),
    '',
    'LATEST CUSTOMER MESSAGE:',
    user,
  ].join('\n');
}

// Resolves early when the signal fires, so an abort does not wait out a backoff.
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

function abortError(signal: AbortSignal): LlmError {
  const reason: unknown = signal.reason;
  return reason instanceof DOMException && reason.name === 'TimeoutError'
    ? new LlmError(`Model did not answer within ${DEADLINE_MS}ms`, 'timeout')
    : new LlmError('Request cancelled by the client', 'upstream');
}

export async function complete(args: CompleteArgs): Promise<Completion> {
  if (isFakeMode()) return { text: fakeComplete(args), model: 'fake' };

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
  const { signal } = args;
  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = 0; i < routing.length; i++) {
      if (pass > 0 || i > 0) await sleep(lastErr?.kind === 'rate_limited' ? 2000 : 400, signal);
      if (signal?.aborted) throw abortError(signal);
      try {
        return await request(routing[i], routing.slice(i), args);
      } catch (err) {
        if (signal?.aborted) throw abortError(signal);
        lastErr = err instanceof LlmError ? err : classify(err);
        if (lastErr.kind === 'config') throw lastErr;
      }
    }
  }
  throw lastErr ?? new LlmError('Unknown model failure', 'upstream');
}

const PASSES = 2;

async function request(model: string, models: string[], args: CompleteArgs): Promise<Completion> {
  const res = await getClient().chat.completions.create(
    {
      model,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: withTranscript(args.user, args.history) },
      ],
      temperature: 0,
      ...(args.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      // OpenRouter routes to the next entry when the primary errors or is
      // rate limited. Other providers ignore the field.
      ...(models.length > 1 ? { models } : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    { signal: args.signal }
  );
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
