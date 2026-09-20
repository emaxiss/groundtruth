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
    // Says out loud whether this process can spend money, so a run does not
    // have to be trusted to have been configured correctly.
    paid_models_allowed: paidModelsAllowed(),
    all_models_free: isFakeMode() ? true : routing.length > 0 && routing.every(isFreeModel),
  });
}
