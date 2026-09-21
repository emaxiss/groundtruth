import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { PINNED_FACTS } from './facts.ts';

export const CORPUS_DIR = join(process.cwd(), 'docs-corpus');
const GROUNDING_CHAR_BUDGET = 4800;

export type Doc = { slug: string; title: string; body: string };

function titleFromSlug(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function loadDocs(): Doc[] {
  return readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const body = readFileSync(join(CORPUS_DIR, f), 'utf8');
      const slug = f.replace(/\.md$/, '');
      const h1 = body.match(/^#\s+(.+)$/m);
      return { slug, title: h1 ? h1[1].trim() : titleFromSlug(slug), body };
    });
}

let cached: string | null = null;

export function buildGroundingBlock(): string {
  if (cached) return cached;
  const docs = loadDocs();
  const sections = docs.map((d) => {
    const facts = PINNED_FACTS[d.slug] ?? [];
    return `## ${d.title} (${d.slug})\n${facts.map((f) => `- ${f}`).join('\n')}`;
  });
  const block = [
    'TASKLOOP DOCUMENTATION (condensed). This is the complete set of documented facts. Treat anything not stated here as undocumented.',
    ...sections,
  ].join('\n\n');
  if (block.length > GROUNDING_CHAR_BUDGET) {
    throw new Error(
      `Grounding block ${block.length} chars exceeds budget ${GROUNDING_CHAR_BUDGET}`
    );
  }
  cached = block;
  return block;
}

export function groundingStats() {
  const block = buildGroundingBlock();
  return {
    docs: loadDocs().length,
    chars: block.length,
    approxTokens: Math.ceil(block.length / 4),
    budgetChars: GROUNDING_CHAR_BUDGET,
  };
}
