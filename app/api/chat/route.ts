import { NextResponse } from 'next/server';
import { complete, LlmError } from '@/lib/llm';
import { chatSystemPrompt, AI_DISCLAIMER } from '@/lib/prompts';
import { ChatInput, type ApiError } from '@/lib/schemas';

const STATUS: Record<LlmError['kind'], number> = {
  rate_limited: 429,
  timeout: 504,
  upstream: 502,
  config: 500,
};

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json<ApiError>(
      { error: 'Request body must be valid JSON', kind: 'validation' },
      { status: 400 }
    );
  }

  const parsed = ChatInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      {
        error: 'Invalid request',
        kind: 'validation',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  try {
    const answer = await complete({
      system: chatSystemPrompt(),
      user: parsed.data.message,
    });
    // Disclaimer is appended here, not requested from the model, so it is
    // present on every answer regardless of what the model returns.
    return NextResponse.json({ answer: `${answer}\n\n${AI_DISCLAIMER}`, disclaimer: AI_DISCLAIMER });
  } catch (err) {
    if (err instanceof LlmError) {
      return NextResponse.json<ApiError>(
        { error: err.message, kind: err.kind },
        { status: STATUS[err.kind] }
      );
    }
    return NextResponse.json<ApiError>(
      { error: 'Unexpected server error', kind: 'upstream' },
      { status: 500 }
    );
  }
}
