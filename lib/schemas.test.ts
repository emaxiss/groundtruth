import { describe, expect, it } from 'vitest';

import { ChatInput, TriageInput, TriageOutput } from './schemas';

describe('ChatInput', () => {
  it('accepts a normal message', () => {
    expect(ChatInput.safeParse({ message: 'What does Pro cost?' }).success).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const parsed = ChatInput.parse({ message: '  hello  ' });
    expect(parsed.message).toBe('hello');
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['newlines only', '\n\n'],
  ])('rejects %s', (_label, message) => {
    expect(ChatInput.safeParse({ message }).success).toBe(false);
  });

  it('rejects a missing message', () => {
    expect(ChatInput.safeParse({}).success).toBe(false);
  });

  it('rejects a non-string message', () => {
    expect(ChatInput.safeParse({ message: 42 }).success).toBe(false);
  });

  it('accepts a message at exactly the limit', () => {
    expect(ChatInput.safeParse({ message: 'a'.repeat(2000) }).success).toBe(true);
  });

  it('rejects a message one character over the limit', () => {
    expect(ChatInput.safeParse({ message: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('reports a field-level error the chat UI can render', () => {
    const result = ChatInput.safeParse({ message: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.message?.[0]).toBe('Message cannot be empty');
    }
  });
});

const TICKET = {
  subject: 'Refund request',
  body: 'I was charged for the annual plan and want a refund.',
  customer_plan: 'pro',
};

describe('TriageInput', () => {
  it('accepts a well-formed ticket', () => {
    expect(TriageInput.safeParse(TICKET).success).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const parsed = TriageInput.parse({ ...TICKET, subject: '  Refund request  ' });
    expect(parsed.subject).toBe('Refund request');
  });

  // The plan decides which refund window applies, so an unrecognised value is a
  // rejected request rather than something for the model to interpret.
  it.each(['free', 'pro', 'team'])('accepts the %s plan', (customer_plan) => {
    expect(TriageInput.safeParse({ ...TICKET, customer_plan }).success).toBe(true);
  });

  it.each(['enterprise', 'Pro', 'PRO', '', undefined])('rejects %o as a plan', (customer_plan) => {
    expect(TriageInput.safeParse({ ...TICKET, customer_plan }).success).toBe(false);
  });

  it.each([
    ['an empty subject', { subject: '' }],
    ['a whitespace subject', { subject: '   ' }],
    ['an empty body', { body: '' }],
    ['a subject over the cap', { subject: 'a'.repeat(201) }],
    ['a body over the cap', { body: 'a'.repeat(2001) }],
  ])('rejects %s', (_label, patch) => {
    expect(TriageInput.safeParse({ ...TICKET, ...patch }).success).toBe(false);
  });

  it('accepts a body at exactly the cap', () => {
    expect(TriageInput.safeParse({ ...TICKET, body: 'a'.repeat(2000) }).success).toBe(true);
  });
});

const CLASSIFICATION = {
  category: 'billing',
  severity: 'medium',
  route_to: 'billing_team',
  refund_eligible: false,
  suggested_reply: 'Our billing team will review the charge.',
  confidence: 0.75,
};

// This schema is the contract the model is held to. Every union here mirrors
// the classification contract in lib/prompts.ts; if the two drift, the model is
// being graded against a shape it was never asked for.
describe('TriageOutput', () => {
  it('accepts a well-formed classification', () => {
    expect(TriageOutput.safeParse(CLASSIFICATION).success).toBe(true);
  });

  it.each(['billing', 'bug', 'how_to', 'feature_request', 'account', 'abuse'])(
    'accepts the %s category',
    (category) => {
      expect(TriageOutput.safeParse({ ...CLASSIFICATION, category }).success).toBe(true);
    }
  );

  it.each(['support_l1', 'support_l2', 'engineering', 'billing_team', 'trust_safety'])(
    'accepts the %s route',
    (route_to) => {
      expect(TriageOutput.safeParse({ ...CLASSIFICATION, route_to }).success).toBe(true);
    }
  );

  it.each([true, false, 'needs_review'])('accepts %o as a refund verdict', (refund_eligible) => {
    expect(TriageOutput.safeParse({ ...CLASSIFICATION, refund_eligible }).success).toBe(true);
  });

  it.each(['maybe', 'yes', null, 1])('rejects %o as a refund verdict', (refund_eligible) => {
    expect(TriageOutput.safeParse({ ...CLASSIFICATION, refund_eligible }).success).toBe(false);
  });

  it.each([0, 0.5, 1])('accepts a confidence of %o', (confidence) => {
    expect(TriageOutput.safeParse({ ...CLASSIFICATION, confidence }).success).toBe(true);
  });

  it.each([-0.1, 1.1, 'high', null])('rejects a confidence of %o', (confidence) => {
    expect(TriageOutput.safeParse({ ...CLASSIFICATION, confidence }).success).toBe(false);
  });

  it.each([
    ['an unknown category', { category: 'refund' }],
    ['an unknown severity', { severity: 'urgent' }],
    ['an unknown route', { route_to: 'ceo' }],
    ['an empty suggested reply', { suggested_reply: '   ' }],
  ])('rejects %s', (_label, patch) => {
    expect(TriageOutput.safeParse({ ...CLASSIFICATION, ...patch }).success).toBe(false);
  });

  it.each(['category', 'severity', 'route_to', 'refund_eligible', 'suggested_reply', 'confidence'])(
    'requires %s',
    (field) => {
      const partial = { ...CLASSIFICATION };
      delete partial[field as keyof typeof partial];
      expect(TriageOutput.safeParse(partial).success).toBe(false);
    }
  );
});
