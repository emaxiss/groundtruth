export { complete, isFakeMode, MODEL_HEADER } from './client';
export type { CompleteArgs, Completion } from './client';
export { LlmError } from './errors';
export type { LlmErrorKind } from './errors';
export { assertModelsAllowed, fallbackModels, isFreeModel, paidModelsAllowed } from './models';
