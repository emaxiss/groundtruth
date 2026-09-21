import { describe, expect, it } from 'vitest';

import { chatSystemPrompt, triageSystemPrompt } from '@/lib/prompts';

describe('system prompts', () => {
  it('ground the chat agent in the documentation', () => {
    expect(chatSystemPrompt()).toContain('Annual plans: full refund within 14 calendar days');
  });

  // Regression: the triage prompt carried the rules and the JSON contract but
  // no documentation, so the classifier decided refund eligibility without
  // ever seeing the refund policy.
  it('ground the triage classifier in the same documentation', () => {
    const prompt = triageSystemPrompt();
    expect(prompt).toContain('CLASSIFICATION CONTRACT');
    expect(prompt).toContain('Monthly plans: refund only within 48 hours');
    expect(prompt).toContain(
      'Duplicate charges and TaskLoop billing errors are always refund-eligible'
    );
  });
});
