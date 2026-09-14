import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as LlmModule from '@/lib/llm';
import { AI_DISCLAIMER } from '@/lib/prompts';
import { ChatResponse } from '@/lib/schemas';

vi.mock('@/lib/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof LlmModule>();
  return { ...actual, complete: vi.fn() };
});

const { complete, LlmError } = await import('@/lib/llm');
const { POST } = await import('./route');

const post = (body: string) => POST(new Request('http://test/api/chat', { method: 'POST', body }));

const chat = (message: unknown) => post(JSON.stringify({ message }));

beforeEach(() => {
  vi.mocked(complete).mockResolvedValue('The Pro plan is $12 per user per month.');
});

afterEach(() => {
  vi.mocked(complete).mockReset();
});

describe('POST /api/chat', () => {
  it('returns the model answer', async () => {
    const res = await chat('What does Pro cost?');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      answer: expect.stringContaining('$12'),
    });
  });

  it('passes the grounded system prompt and the message to the model', async () => {
    await chat('What does Pro cost?');
    expect(complete).toHaveBeenCalledWith({
      system: expect.stringContaining('TASKLOOP DOCUMENTATION'),
      user: 'What does Pro cost?',
    });
  });

  it('sends the trimmed message rather than the raw input', async () => {
    await chat('  What does Pro cost?  ');
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ user: 'What does Pro cost?' }));
  });
});

// The disclaimer is appended in the route rather than requested from the model,
// so it holds regardless of what the model returns. These cover the cases a
// model could otherwise break: omitting it, or returning something empty.
describe('disclaimer', () => {
  it('appends the disclaimer to every answer', async () => {
    const body = ChatResponse.parse(await (await chat('What does Pro cost?')).json());
    expect(body.answer.endsWith(AI_DISCLAIMER)).toBe(true);
    expect(body.disclaimer).toBe(AI_DISCLAIMER);
  });

  it('appends it even when the model never mentions it', async () => {
    vi.mocked(complete).mockResolvedValue('No disclaimer here.');
    const body = ChatResponse.parse(await (await chat('What does Pro cost?')).json());
    expect(body.answer).toContain(AI_DISCLAIMER);
  });
});

describe('input validation', () => {
  it('rejects a body that is not valid JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ kind: 'validation' });
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['missing', undefined],
    ['wrong type', 42],
    ['over the length cap', 'a'.repeat(2001)],
  ])('rejects a message that is %s', async (_label, message) => {
    const res = await chat(message);
    expect(res.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it('reports a field-level error the UI can render', async () => {
    const body = await (await chat('')).json();
    expect(body.details.message[0]).toEqual(expect.any(String));
  });

  it('accepts a message at exactly the length cap', async () => {
    expect((await chat('a'.repeat(2000))).status).toBe(200);
  });
});

// The eval harness reads these statuses to tell provider rate limiting from a
// genuine model failure. A 429 scored as a failed eval case would be a
// misleading result, so the mapping is asserted rather than assumed.
describe('model failures', () => {
  it.each([
    ['rate_limited', 429],
    ['timeout', 504],
    ['upstream', 502],
    ['config', 500],
  ] as const)('maps a %s failure to HTTP %i', async (kind, status) => {
    vi.mocked(complete).mockRejectedValue(new LlmError('failed', kind));
    const res = await chat('What does Pro cost?');
    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toMatchObject({ kind, error: 'failed' });
  });

  it('maps an unexpected error to a 500 without leaking its message', async () => {
    vi.mocked(complete).mockRejectedValue(new Error('connection string: postgres://secret'));
    const res = await chat('What does Pro cost?');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unexpected server error', kind: 'upstream' });
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
