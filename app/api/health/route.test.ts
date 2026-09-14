import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The route reads the environment at call time, so each case re-imports it
// against a fresh module registry rather than sharing one instance.
const health = async (env: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { GET } = await import('./route');
  return (await GET().json()) as Record<string, unknown>;
};

const original = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...original };
});

describe('GET /api/health', () => {
  it('reports fake mode and masks the model name', async () => {
    await expect(health({ GROUNDTRUTH_FAKE_LLM: '1' })).resolves.toMatchObject({
      status: 'ok',
      fake_llm: true,
      model: 'fake',
    });
  });

  it('reports the configured model when not in fake mode', async () => {
    await expect(
      health({ GROUNDTRUTH_FAKE_LLM: '0', GROUNDTRUTH_MODEL: 'vendor/some-model' })
    ).resolves.toMatchObject({ fake_llm: false, model: 'vendor/some-model' });
  });

  it('reports a null model when none is configured', async () => {
    await expect(
      health({ GROUNDTRUTH_FAKE_LLM: '0', GROUNDTRUTH_MODEL: undefined })
    ).resolves.toMatchObject({ model: null });
  });

  // Only the exact string "1" enables fake mode. A truthy-but-wrong value must
  // not silently route the eval suite to canned answers.
  it.each(['0', 'true', 'yes', ''])('does not treat %o as fake mode', async (value) => {
    await expect(health({ GROUNDTRUTH_FAKE_LLM: value })).resolves.toMatchObject({
      fake_llm: false,
    });
  });

  it('never exposes the API key', async () => {
    const body = await health({ GROUNDTRUTH_FAKE_LLM: '0', GROUNDTRUTH_API_KEY: 'sk-secret' });
    expect(JSON.stringify(body)).not.toContain('sk-secret');
  });

  it('reports the corpus size and grounding budget the agent actually loaded', async () => {
    const body = await health({ GROUNDTRUTH_FAKE_LLM: '1' });
    expect(body.corpus_docs).toBe(12);
    expect(body.grounding_tokens).toBeGreaterThan(0);
  });
});
