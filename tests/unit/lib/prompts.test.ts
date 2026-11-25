import { describe, expect, it } from 'vitest';

import { chatSystemPrompt, triageSystemPrompt } from '@/lib/prompts';
import { TriageOutput } from '@/lib/schemas';

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

// The words in the routing rule that send each category to a team. A live run
// on 2026-11-21 routed a feature request to engineering because no rule named
// feature requests. A category added to the schema fails here until the
// routing rule says where it goes.
const ROUTED_BY: Record<TriageOutput['category'], string> = {
  billing: 'charges/refunds/invoices',
  bug: 'reproducible bugs',
  how_to: 'how-to',
  feature_request: 'feature requests',
  account: 'account/config issues',
  abuse: 'abuse',
};

describe('triage routing rule', () => {
  const rule = triageSystemPrompt()
    .split('\n')
    .find((line) => line.startsWith('- route_to:'));

  it.each(TriageOutput.shape.category.options)('says where a %s ticket goes', (category) => {
    expect(ROUTED_BY[category], `no routing words listed for ${category}`).toBeDefined();
    expect(rule).toContain(ROUTED_BY[category]);
  });

  it.each(TriageOutput.shape.route_to.options)('names the %s team', (team) => {
    expect(rule).toContain(team);
  });
});
