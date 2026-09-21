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
