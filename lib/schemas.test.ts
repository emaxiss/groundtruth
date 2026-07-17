import { describe, expect, it } from 'vitest';

import { ChatInput } from './schemas';

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

  it('reports a field-level error the UI can render', () => {
    const result = ChatInput.safeParse({ message: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.message?.[0]).toBe('Message cannot be empty');
    }
  });
});
