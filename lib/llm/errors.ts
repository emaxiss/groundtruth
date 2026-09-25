export type LlmErrorKind = 'rate_limited' | 'timeout' | 'upstream' | 'config';

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: LlmErrorKind,
    readonly status?: number
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export const HTTP_STATUS: Record<LlmErrorKind, number> = {
  rate_limited: 429,
  timeout: 504,
  upstream: 502,
  config: 500,
};

// What a caller is told. An LlmError's own message can carry provider response
// text or configuration details, so routes log it and return one of these.
const PUBLIC_MESSAGE: Record<LlmErrorKind, string> = {
  rate_limited: 'The model provider is rate limiting requests. Try again shortly.',
  timeout: 'The model did not respond in time. Try again.',
  upstream: 'The model provider returned an error. Try again.',
  config: 'The service is not configured to reach a model.',
};

// A daily cap keeps its own wording: it does not clear in seconds, and the
// eval harness stops retrying when a 429 says so.
const DAILY_CAP = /per-day|daily/i;

export function publicMessage(err: LlmError): string {
  if (err.kind === 'rate_limited' && DAILY_CAP.test(err.message))
    return "The model provider's daily request limit is reached. Try again after it resets.";
  return PUBLIC_MESSAGE[err.kind];
}
