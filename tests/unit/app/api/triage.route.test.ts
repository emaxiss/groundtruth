import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import type * as LlmModule from '@/lib/llm';
import { TRIAGE_REPAIR_PREFIX } from '@/lib/prompts';
import { TriageOutput } from '@/lib/schemas';

vi.mock('@/lib/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof LlmModule>();
  return { ...actual, complete: vi.fn() };
});

const { complete, LlmError } = await import('@/lib/llm');

const completion = (text: string) => ({ text, model: 'test-model' });
const { POST } = await import('@/app/api/triage/route');

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
  vi.mocked(complete).mockResolvedValue(completion(JSON.stringify(VALID)));
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
    vi.mocked(complete).mockResolvedValue(
      completion('```json\n' + JSON.stringify(VALID) + '\n```')
    );
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
      .mockResolvedValueOnce(completion('{"category":"billing"}'))
      .mockResolvedValueOnce(completion(JSON.stringify(VALID)));

    const res = await triage();
    expect(res.status).toBe(200);
    expect(complete).toHaveBeenCalledTimes(2);

    const { user } = vi.mocked(complete).mock.calls[1][0];
    expect(user).toContain(TRIAGE_REPAIR_PREFIX);
    expect(user).toContain('severity');
  });

  it('retries when the response is not JSON at all', async () => {
    vi.mocked(complete)
      .mockResolvedValueOnce(completion('Sure! Here is the classification.'))
      .mockResolvedValueOnce(completion(JSON.stringify(VALID)));
    expect((await triage()).status).toBe(200);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('gives up after one repair attempt', async () => {
    vi.mocked(complete).mockResolvedValue(completion('{"category":"nonsense"}'));
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
    vi.mocked(complete).mockResolvedValue(completion(JSON.stringify(payload)));
    expect((await triage()).status).toBe(502);
  });

  it('accepts needs_review as a refund verdict', async () => {
    vi.mocked(complete).mockResolvedValue(
      completion(JSON.stringify({ ...VALID, refund_eligible: 'needs_review' }))
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
  let logged: MockInstance<typeof console.error>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it.each([
    ['rate_limited', 429],
    ['timeout', 504],
    ['upstream', 502],
    ['config', 500],
  ] as const)('maps a %s failure to HTTP %i and a fixed message', async (kind, status) => {
    vi.mocked(complete).mockRejectedValue(
      new LlmError('provider said 401: No auth credentials for sk-or-v1-abc123', kind)
    );
    const res = await triage();
    expect(res.status).toBe(status);
    const body = (await res.json()) as { error: string; kind: string };
    expect(body.kind).toBe(kind);
    expect(body.error).toMatch(/\w/);
    expect(body.error).not.toMatch(/sk-or-v1|No auth credentials|provider said/);
  });

  it('logs the provider detail on the server instead of returning it', async () => {
    vi.mocked(complete).mockRejectedValue(
      new LlmError('provider said 401: No auth credentials for sk-or-v1-abc123', 'upstream')
    );
    await triage();
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('No auth credentials'));
  });

  // The eval harness stops retrying when a 429 names a daily cap, so that
  // signal survives even though the provider's own text does not.
  it('says when a rate limit is the daily cap', async () => {
    vi.mocked(complete).mockRejectedValue(
      new LlmError(
        'Provider rate limited: Rate limit exceeded: free-models-per-day',
        'rate_limited',
        429
      )
    );
    const body = (await (await triage()).json()) as { error: string };
    expect(body.error).toMatch(/daily/);
    expect(body.error).not.toContain('free-models-per-day');
  });

  // Both failures return 502, so the kind is what tells the eval harness
  // whether the provider broke or the model did not follow the contract.
  it('distinguishes a schema failure from an upstream failure', async () => {
    vi.mocked(complete).mockResolvedValue(completion('{}'));
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
