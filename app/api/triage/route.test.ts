import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as LlmModule from '@/lib/llm';
import { TRIAGE_REPAIR_PREFIX } from '@/lib/prompts';
import { TriageOutput } from '@/lib/schemas';

vi.mock('@/lib/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof LlmModule>();
  return { ...actual, complete: vi.fn() };
});

const { complete, LlmError } = await import('@/lib/llm');
const { POST } = await import('./route');

const VALID = {
  category: 'billing',
  severity: 'medium',
  route_to: 'billing_team',
  refund_eligible: false,
  suggested_reply: 'Our billing team will review the charge and follow up.',
  confidence: 0.75,
};

const TICKET = {
  subject: 'Refund request',
  body: 'I was charged for the annual plan and want a refund.',
  customer_plan: 'pro',
};

const post = (body: string) =>
  POST(new Request('http://test/api/triage', { method: 'POST', body }));

const triage = (input: unknown = TICKET) => post(JSON.stringify(input));

beforeEach(() => {
  vi.mocked(complete).mockResolvedValue(JSON.stringify(VALID));
});

afterEach(() => {
  vi.mocked(complete).mockReset();
});

describe('POST /api/triage', () => {
  it('returns the classification', async () => {
    const res = await triage();
    expect(res.status).toBe(200);
    expect(TriageOutput.parse(await res.json())).toEqual(VALID);
  });

  it('asks the model for JSON', async () => {
    await triage();
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ jsonMode: true }));
  });

  it('puts the ticket and the plan in the prompt', async () => {
    await triage();
    const { user } = vi.mocked(complete).mock.calls[0][0];
    expect(user).toContain('Refund request');
    expect(user).toContain('Customer plan: pro');
  });

  it('accepts a response wrapped in a code fence', async () => {
    vi.mocked(complete).mockResolvedValue('```json\n' + JSON.stringify(VALID) + '\n```');
    expect((await triage()).status).toBe(200);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

// The model is asked for a strict shape, so the route has to decide what
// counts as compliance. One repair attempt, then a typed failure the eval
// harness can distinguish from a model outage.
describe('schema repair', () => {
  it('retries once with the schema errors when the first response is malformed', async () => {
    vi.mocked(complete)
      .mockResolvedValueOnce('{"category":"billing"}')
      .mockResolvedValueOnce(JSON.stringify(VALID));

    const res = await triage();
    expect(res.status).toBe(200);
    expect(complete).toHaveBeenCalledTimes(2);

    const { user } = vi.mocked(complete).mock.calls[1][0];
    expect(user).toContain(TRIAGE_REPAIR_PREFIX);
    expect(user).toContain('severity');
  });

  it('retries when the response is not JSON at all', async () => {
    vi.mocked(complete)
      .mockResolvedValueOnce('Sure! Here is the classification.')
      .mockResolvedValueOnce(JSON.stringify(VALID));
    expect((await triage()).status).toBe(200);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('gives up after one repair attempt', async () => {
    vi.mocked(complete).mockResolvedValue('{"category":"nonsense"}');
    const res = await triage();
    expect(res.status).toBe(502);
    expect(complete).toHaveBeenCalledTimes(2);
    await expect(res.json()).resolves.toMatchObject({ kind: 'schema' });
  });

  it.each([
    ['an unknown category', { ...VALID, category: 'refund' }],
    ['an unknown route', { ...VALID, route_to: 'ceo' }],
    ['confidence above 1', { ...VALID, confidence: 1.5 }],
    ['a non-numeric confidence', { ...VALID, confidence: 'high' }],
    ['an empty suggested reply', { ...VALID, suggested_reply: '   ' }],
    ['a string where a boolean belongs', { ...VALID, refund_eligible: 'maybe' }],
  ])('rejects %s', async (_label, payload) => {
    vi.mocked(complete).mockResolvedValue(JSON.stringify(payload));
    expect((await triage()).status).toBe(502);
  });

  it('accepts needs_review as a refund verdict', async () => {
    vi.mocked(complete).mockResolvedValue(
      JSON.stringify({ ...VALID, refund_eligible: 'needs_review' })
    );
    expect((await triage()).status).toBe(200);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe('input validation', () => {
  it('rejects a body that is not valid JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing subject', { ...TICKET, subject: undefined }],
    ['an empty subject', { ...TICKET, subject: '  ' }],
    ['an empty body', { ...TICKET, body: '' }],
    ['a body over the cap', { ...TICKET, body: 'a'.repeat(2001) }],
    ['a subject over the cap', { ...TICKET, subject: 'a'.repeat(201) }],
    ['an unknown plan', { ...TICKET, customer_plan: 'enterprise' }],
    ['a missing plan', { ...TICKET, customer_plan: undefined }],
  ])('rejects %s', async (_label, input) => {
    const res = await triage(input);
    expect(res.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it('accepts a body at exactly the cap', async () => {
    expect((await triage({ ...TICKET, body: 'a'.repeat(2000) })).status).toBe(200);
  });

  it('reports field-level errors the UI can render', async () => {
    const res = await triage({ subject: '', body: '', customer_plan: 'nope' });
    const body = (await res.json()) as { details: Record<string, string[]> };
    expect(Object.keys(body.details).sort()).toEqual(['body', 'customer_plan', 'subject']);
  });
});

describe('model failures', () => {
  it.each([
    ['rate_limited', 429],
    ['timeout', 504],
    ['upstream', 502],
    ['config', 500],
  ] as const)('maps a %s failure to HTTP %i', async (kind, status) => {
    vi.mocked(complete).mockRejectedValue(new LlmError('failed', kind));
    const res = await triage();
    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toMatchObject({ kind });
  });

  // Both failures return 502, so the kind is what tells the eval harness
  // whether the provider broke or the model did not follow the contract.
  it('distinguishes a schema failure from an upstream failure', async () => {
    vi.mocked(complete).mockResolvedValue('{}');
    await expect((await triage()).json()).resolves.toMatchObject({ kind: 'schema' });

    vi.mocked(complete).mockRejectedValue(new LlmError('provider down', 'upstream'));
    await expect((await triage()).json()).resolves.toMatchObject({ kind: 'upstream' });
  });

  it('maps an unexpected error to a 500 without leaking its message', async () => {
    vi.mocked(complete).mockRejectedValue(new Error('connection string: postgres://secret'));
    const res = await triage();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
  });
});
