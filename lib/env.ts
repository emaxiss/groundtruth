// Every GROUNDTRUTH_* variable is read here and nowhere else, so the env
// contract is one file and a rename cannot leave a stale read behind.
export type Env = {
  fakeLlm: boolean;
  baseUrl: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  fallbackModels: string[];
  allowPaidModels: boolean;
};

export function readEnv(): Env {
  return {
    fakeLlm: process.env.GROUNDTRUTH_FAKE_LLM === '1',
    baseUrl: process.env.GROUNDTRUTH_BASE_URL || undefined,
    apiKey: process.env.GROUNDTRUTH_API_KEY || undefined,
    model: process.env.GROUNDTRUTH_MODEL || undefined,
    fallbackModels: splitList(process.env.GROUNDTRUTH_FALLBACK_MODELS),
    allowPaidModels: process.env.GROUNDTRUTH_ALLOW_PAID_MODELS === '1',
  };
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}
