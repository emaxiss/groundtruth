import { NextResponse } from 'next/server';

import { guardAnswer } from '@/lib/guardrails';
import { complete, HTTP_STATUS, LlmError, MODEL_HEADER, publicMessage } from '@/lib/llm';
import { chatSystemPrompt, AI_DISCLAIMER } from '@/lib/prompts';
import { ChatInput, type ApiError } from '@/lib/schemas';

// Set when the output guard replaced the model's answer, so a caller can count how often it fires.
const GUARD_HEADER = 'x-groundtruth-guard';

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
    const { text, model } = await complete({
      system: chatSystemPrompt(),
      user: parsed.data.message,
      // Only the customer's earlier messages are forwarded. There is no
      // server-side conversation store, so an agent turn sent by the client
      // cannot be verified, and a forged one promising a refund was honoured
      // by a live model when it was passed through.
      history: (parsed.data.history ?? [])
        .filter((turn) => turn.role === 'customer')
        .map((turn) => turn.text),
    });
    const guarded = guardAnswer(text);
    // Disclaimer is appended here, not requested from the model, so it is
    // present on every answer regardless of what the model returns.
    return NextResponse.json(
      {
        answer: `${guarded.text}\n\n${AI_DISCLAIMER}`,
        disclaimer: AI_DISCLAIMER,
      },
      {
        headers: {
          [MODEL_HEADER]: model,
          ...(guarded.blocked ? { [GUARD_HEADER]: 'disclosure' } : {}),
        },
      }
    );
  } catch (err) {
    if (err instanceof LlmError) {
      console.error(`[chat] ${err.kind}: ${err.message}`);
      return NextResponse.json<ApiError>(
        { error: publicMessage(err), kind: err.kind },
        { status: HTTP_STATUS[err.kind] }
      );
    }
    console.error(`[chat] unexpected error`, err);
    return NextResponse.json<ApiError>(
      { error: 'Unexpected server error', kind: 'upstream' },
      { status: 500 }
    );
  }
}
