import { NextResponse } from 'next/server';

import { complete, HTTP_STATUS, LlmError, MODEL_HEADER, publicMessage } from '@/lib/llm';
import { triageSystemPrompt, triageUserPrompt, TRIAGE_REPAIR_PREFIX } from '@/lib/prompts';
import { TriageInput, TriageOutput, type ApiError } from '@/lib/schemas';

// A model that returns prose around its JSON has still failed the contract, but
// a code fence is a common enough formatting slip that stripping it is cheaper
// than spending the one repair attempt on it.
function stripFence(text: string): string {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(text.trim());
  return fenced ? fenced[1].trim() : text.trim();
}

function parseTriage(raw: string) {
  let value: unknown;
  try {
    value = JSON.parse(stripFence(raw));
  } catch {
    return { ok: false as const, errors: ['Response was not valid JSON'] };
  }
  const parsed = TriageOutput.safeParse(value);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  return {
    ok: false as const,
    errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

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

  const parsed = TriageInput.safeParse(raw);
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

  const system = triageSystemPrompt();
  const user = triageUserPrompt(parsed.data);

  try {
    const attempt = await complete({ system, user, jsonMode: true });
    const first = parseTriage(attempt.text);
    if (first.ok)
      return NextResponse.json(first.data, { headers: { [MODEL_HEADER]: attempt.model } });

    // One repair attempt. The model is shown its own schema errors rather than
    // being asked again blind, because a second identical prompt tends to
    // reproduce the same malformed output.
    const retry = await complete({
      system,
      user: `${TRIAGE_REPAIR_PREFIX}\n\nErrors:\n${first.errors.join('\n')}\n\n${user}`,
      jsonMode: true,
    });
    const repaired = parseTriage(retry.text);
    if (repaired.ok)
      return NextResponse.json(repaired.data, { headers: { [MODEL_HEADER]: retry.model } });

    return NextResponse.json<ApiError>(
      {
        error: 'Model did not return a valid classification',
        kind: 'schema',
        details: repaired.errors,
      },
      { status: 502 }
    );
  } catch (err) {
    if (err instanceof LlmError) {
      console.error(`[triage] ${err.kind}: ${err.message}`);
      return NextResponse.json<ApiError>(
        { error: publicMessage(err), kind: err.kind },
        { status: HTTP_STATUS[err.kind] }
      );
    }
    console.error(`[triage] unexpected error`, err);
    return NextResponse.json<ApiError>(
      { error: 'Unexpected server error', kind: 'upstream' },
      { status: 500 }
    );
  }
}
