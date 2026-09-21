import { readEnv } from '../env';

import { LlmError } from './errors';

/** The models tried after the primary, in order. Empty when none are configured. */
export function fallbackModels(): string[] {
  return readEnv().fallbackModels;
}

// OpenRouter bills any model whose id does not end in `:free`. An account with
// credit will serve one without warning, so a typo in an env var could turn a
// free run into a charged one. Paid models require an explicit opt-in.
export function paidModelsAllowed(): boolean {
  return readEnv().allowPaidModels;
}

export function isFreeModel(model: string): boolean {
  return model.trim().endsWith(':free');
}

/** Throws unless every model in the routing list is free, or paid use is opted into. */
export function assertModelsAllowed(models: string[]): void {
  if (paidModelsAllowed()) return;
  const paid = models.filter((m) => !isFreeModel(m));
  if (paid.length === 0) return;
  throw new LlmError(
    `Refusing to call a paid model: ${paid.join(', ')}. ` +
      'Every model id must end in ":free", or set GROUNDTRUTH_ALLOW_PAID_MODELS=1 to opt in.',
    'config'
  );
}
