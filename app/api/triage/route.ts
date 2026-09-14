import { NextResponse } from 'next/server';

import { complete, LlmError } from '@/lib/llm';
import { triageSystemPrompt, triageUserPrompt, TRIAGE_REPAIR_PREFIX } from '@/lib/prompts';
import { TriageInput, TriageOutput, type ApiError } from '@/lib/schemas';

const STATUS: Record<LlmError['kind'], number> = {
  rate_limited: 429,
  timeout: 504,
  upstream: 502,
  config: 500,
};

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
    const first = parseTriage(await complete({ system, user, jsonMode: true }));
    if (first.ok) return NextResponse.json(first.data);

    // One repair attempt. The model is shown its own schema errors rather than
    // being asked again blind, because a second identical prompt tends to
    // reproduce the same malformed output.
    const repaired = parseTriage(
      await complete({
        system,
        user: `${TRIAGE_REPAIR_PREFIX}\n\nErrors:\n${first.errors.join('\n')}\n\n${user}`,
        jsonMode: true,
      })
    );
    if (repaired.ok) return NextResponse.json(repaired.data);

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
