import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { complete, fallbackModels } from './llm';

// vi.mock is hoisted above the imports; vi.hoisted keeps the spy in scope.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const ENV = { ...process.env };

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ model: 'served/by', choices: [{ message: { content: 'ok' } }] });
  process.env.GROUNDTRUTH_FAKE_LLM = '0';
  process.env.GROUNDTRUTH_BASE_URL = 'https://example.test/v1';
  process.env.GROUNDTRUTH_API_KEY = 'k';
  process.env.GROUNDTRUTH_MODEL = 'primary';
  delete process.env.GROUNDTRUTH_FALLBACK_MODELS;
});

afterEach(() => {
  process.env = { ...ENV };
});

describe('fallbackModels', () => {
  it('is empty when unset', () => {
    expect(fallbackModels()).toEqual([]);
  });

  it('splits on commas and trims blanks', () => {
    process.env.GROUNDTRUTH_FALLBACK_MODELS = ' a/b:free , , c/d ';
    expect(fallbackModels()).toEqual(['a/b:free', 'c/d']);
  });
});

describe('complete', () => {
  it('sends only the primary model when no fallbacks are configured', async () => {
    await complete({ system: 's', user: 'u' });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('primary');
    expect(params).not.toHaveProperty('models');
  });

  it('sends the ordered routing list when fallbacks are configured', async () => {
    process.env.GROUNDTRUTH_FALLBACK_MODELS = 'second,third';
    await complete({ system: 's', user: 'u', jsonMode: true });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('primary');
    expect(params.models).toEqual(['primary', 'second', 'third']);
    expect(params.response_format).toEqual({ type: 'json_object' });
  });

  it('returns the text with the model the provider reports it served', async () => {
    await expect(complete({ system: 's', user: 'u' })).resolves.toEqual({
      text: 'ok',
      model: 'served/by',
    });
  });

  it('falls back to the requested model when the provider omits it', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
    await expect(complete({ system: 's', user: 'u' })).resolves.toEqual({
      text: 'ok',
      model: 'primary',
    });
  });

  it.each([
    ['a payload with no choices key', { model: 'm' }],
    ['an empty choices array', { model: 'm', choices: [] }],
    ['a non-array choices value', { model: 'm', choices: null }],
  ])('maps %s to an upstream error instead of crashing', async (_label, payload) => {
    create.mockResolvedValue(payload);
    await expect(complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      name: 'LlmError',
      kind: 'upstream',
    });
  });

  it('includes the provider error message when one is present', async () => {
    create.mockResolvedValue({ error: { message: 'upstream capacity exceeded' } });
    await expect(complete({ system: 's', user: 'u' })).rejects.toThrow(
      /upstream capacity exceeded/
    );
  });
});
