import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModelsAllowed, complete, fallbackModels, isFreeModel } from '@/lib/llm';

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
  process.env.GROUNDTRUTH_MODEL = 'primary:free';
  delete process.env.GROUNDTRUTH_FALLBACK_MODELS;
  delete process.env.GROUNDTRUTH_ALLOW_PAID_MODELS;
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
    expect(params.model).toBe('primary:free');
    expect(params).not.toHaveProperty('models');
  });

  it('sends the ordered routing list when fallbacks are configured', async () => {
    process.env.GROUNDTRUTH_FALLBACK_MODELS = 'second:free,third:free';
    await complete({ system: 's', user: 'u', jsonMode: true });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('primary:free');
    expect(params.models).toEqual(['primary:free', 'second:free', 'third:free']);
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
      model: 'primary:free',
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

  it('refuses to call a paid primary model', async () => {
    process.env.GROUNDTRUTH_MODEL = 'openai/gpt-5';
    await expect(complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      name: 'LlmError',
      kind: 'config',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses when only a fallback is paid', async () => {
    process.env.GROUNDTRUTH_MODEL = 'a/b:free';
    process.env.GROUNDTRUTH_FALLBACK_MODELS = 'c/d:free,e/f';
    await expect(complete({ system: 's', user: 'u' })).rejects.toThrow(/e\/f/);
    expect(create).not.toHaveBeenCalled();
  });

  it('calls a paid model only when explicitly opted in', async () => {
    process.env.GROUNDTRUTH_MODEL = 'openai/gpt-5';
    process.env.GROUNDTRUTH_ALLOW_PAID_MODELS = '1';
    await expect(complete({ system: 's', user: 'u' })).resolves.toMatchObject({ text: 'ok' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('never reaches the guard in fake mode', async () => {
    process.env.GROUNDTRUTH_FAKE_LLM = '1';
    process.env.GROUNDTRUTH_MODEL = 'openai/gpt-5';
    await expect(complete({ system: 's', user: 'What does Pro cost?' })).resolves.toMatchObject({
      model: 'fake',
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('isFreeModel', () => {
  it.each([
    ['google/gemma-4-31b-it:free', true],
    ['nvidia/nemotron-3-super-120b-a12b:free', true],
    ['openai/gpt-5', false],
    ['deepseek/deepseek-v4-flash-0731', false],
    ['  a/b:free  ', true],
    ['a/b:free-ish', false],
  ])('classifies %s', (model, free) => {
    expect(isFreeModel(model)).toBe(free);
  });
});

describe('assertModelsAllowed', () => {
  it('passes when every model is free', () => {
    expect(() => assertModelsAllowed(['a/b:free', 'c/d:free'])).not.toThrow();
  });

  it('names every paid model in the error', () => {
    expect(() => assertModelsAllowed(['a/b:free', 'paid/one', 'paid/two'])).toThrow(
      /paid\/one, paid\/two/
    );
  });
});

describe('rotation', () => {
  const overloaded = { error: { message: 'Service temporarily overloaded' } };
  const answer = { model: 'third:free', choices: [{ message: { content: 'ok' } }] };

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.GROUNDTRUTH_FALLBACK_MODELS = 'second:free,third:free';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the next model in the list when an upstream returns no completion', async () => {
    create
      .mockResolvedValueOnce(overloaded)
      .mockResolvedValueOnce(overloaded)
      .mockResolvedValueOnce(answer);
    const pending = complete({ system: 's', user: 'u' });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ text: 'ok', model: 'third:free' });
    expect(create.mock.calls.map((c) => (c[0] as { model: string }).model)).toEqual([
      'primary:free',
      'second:free',
      'third:free',
    ]);
    expect(create.mock.calls[1][0].models).toEqual(['second:free', 'third:free']);
    expect(create.mock.calls[2][0]).not.toHaveProperty('models');
  });

  it('makes a second pass over the list before giving up', async () => {
    create.mockResolvedValue(overloaded);
    const pending = complete({ system: 's', user: 'u' });
    pending.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(pending).rejects.toMatchObject({ kind: 'upstream' });
    expect(create).toHaveBeenCalledTimes(6);
  });

  it('rotates on a timeout as well as an upstream error', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'APIConnectionTimeoutError' });
    create.mockRejectedValueOnce(timeout).mockResolvedValueOnce(answer);
    const pending = complete({ system: 's', user: 'u' });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ text: 'ok' });
    expect(create.mock.calls[1][0].model).toBe('second:free');
  });

  it('stops at once on a configuration error', async () => {
    process.env.GROUNDTRUTH_FALLBACK_MODELS = 'second:free,paid/model';
    await expect(complete({ system: 's', user: 'u' })).rejects.toMatchObject({ kind: 'config' });
    expect(create).not.toHaveBeenCalled();
  });
});
