import { NextResponse } from 'next/server';

import { groundingStats } from '@/lib/corpus';
import { isFakeMode } from '@/lib/llm';

export function GET() {
  const stats = groundingStats();
  return NextResponse.json({
    status: 'ok',
    fake_llm: isFakeMode(),
    model: isFakeMode() ? 'fake' : (process.env.GROUNDTRUTH_MODEL ?? null),
    corpus_docs: stats.docs,
    grounding_tokens: stats.approxTokens,
  });
}
