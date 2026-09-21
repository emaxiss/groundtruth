import { describe, expect, it } from 'vitest';

import { buildGroundingBlock, groundingStats, loadDocs } from '@/lib/corpus';

describe('loadDocs', () => {
  it('loads the full corpus', () => {
    expect(loadDocs()).toHaveLength(12);
  });

  it('gives every document a slug, title, and body', () => {
    for (const doc of loadDocs()) {
      expect(doc.slug).toMatch(/^[a-z-]+$/);
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.body.length).toBeGreaterThan(0);
    }
  });
});

describe('buildGroundingBlock', () => {
  it('stays within the token budget', () => {
    const stats = groundingStats();
    expect(stats.chars).toBeLessThanOrEqual(stats.budgetChars);
  });

  it('is stable across calls', () => {
    expect(buildGroundingBlock()).toBe(buildGroundingBlock());
  });

  // The guardrail evals assert against these figures. If budget trimming ever
  // drops one, the agent starts inventing policy and the failure looks like a
  // model problem rather than a corpus problem.
  it.each([
    ['Pro monthly price', '$12'],
    ['Team monthly price', '$29'],
    ['annual refund window', '14 calendar days'],
    ['monthly refund window', '48 hours'],
    ['API rate limit', '100 requests/minute'],
    ['uptime commitment', '99.9%'],
    ['free plan board limit', '3 boards'],
  ])('pins the %s', (_label, fact) => {
    expect(buildGroundingBlock()).toContain(fact);
  });

  it('states that downgrades are credit rather than a cash refund', () => {
    expect(buildGroundingBlock()).toMatch(/never a cash refund/i);
  });

  it('covers every document in the corpus', () => {
    const block = buildGroundingBlock();
    for (const doc of loadDocs()) {
      expect(block).toContain(doc.slug);
    }
  });
});
