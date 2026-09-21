import { NextResponse } from 'next/server';

import { groundingStats } from '@/lib/corpus';
import { fallbackModels, isFakeMode, isFreeModel, paidModelsAllowed } from '@/lib/llm';

export function GET() {
  const stats = groundingStats();
  const model = process.env.GROUNDTRUTH_MODEL ?? null;
  const routing = [model, ...fallbackModels()].filter((m): m is string => Boolean(m));
  return NextResponse.json({
    status: 'ok',
    fake_llm: isFakeMode(),
    model: isFakeMode() ? 'fake' : model,
    corpus_docs: stats.docs,
    grounding_tokens: stats.approxTokens,
    // Reports whether this process can spend money, so the harness can check
    // the configuration instead of assuming it.
    paid_models_allowed: paidModelsAllowed(),
    all_models_free: isFakeMode() ? true : routing.length > 0 && routing.every(isFreeModel),
  });
}
