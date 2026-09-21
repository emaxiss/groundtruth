'use client';

import { useEffect, useRef, useState } from 'react';

import { LIMITS } from '@/lib/limits';
import { ApiErrorResponse, ChatResponse } from '@/lib/schemas';

import { CharCount, EmptyState, ErrorAlert, PendingRow, SubmitButton } from './primitives';

type Msg = { role: 'user' | 'agent'; text: string };

export function ChatPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, loading]);

  const tooLong = input.length > LIMITS.message;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message) {
      setInvalid('Enter a message before sending.');
      return;
    }
    if (tooLong) {
      setInvalid(`Message must be ${LIMITS.message} characters or fewer.`);
      return;
    }
    setInvalid(null);
    setError(null);
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Earlier turns go with the message so a follow-up has its context.
        body: JSON.stringify({
          message,
          history: msgs
            .slice(-LIMITS.historyTurns)
            .map((m) => ({ role: m.role === 'user' ? 'customer' : 'agent', text: m.text })),
        }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const err = ApiErrorResponse.safeParse(body);
        setError(err.success ? err.data.error : `Request failed (${res.status})`);
        return;
      }
      const parsed = ChatResponse.safeParse(body);
      if (!parsed.success) {
        setError('The server returned an unexpected response.');
        return;
      }
      setMsgs((m) => [...m, { role: 'agent', text: parsed.data.answer }]);
    } catch {
      setError('Could not reach the API. Is the dev server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      role="tabpanel"
      id="panel-chat"
      aria-labelledby="tab-chat"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
        data-testid="message-list"
        aria-live="polite"
        aria-busy={loading}
      >
        {msgs.length === 0 && !loading && (
          <EmptyState testId="chat-empty">
            No messages yet. Ask about plans, refunds, limits, or integrations.
          </EmptyState>
        )}

        {msgs.map((m, i) => (
          <article
            key={i}
            data-testid={m.role === 'user' ? 'msg-user' : 'msg-agent'}
            aria-label={m.role === 'user' ? 'Customer message' : 'Agent reply'}
            className={`gt-rise border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'border-line bg-panel text-dim'
                : 'border-signaldim/40 bg-raised text-text'
            }`}
          >
            <div className="mb-1.5 text-[10px] tracking-[0.18em] text-faint uppercase">
              {m.role === 'user' ? 'customer' : 'agent'}
            </div>
            {m.text}
          </article>
        ))}

        {loading && <PendingRow testId="chat-loading" label="agent is responding…" />}
        <div ref={endRef} />
      </div>

      {error && <ErrorAlert testId="chat-error" message={error} className="mt-3" />}

      <form
        onSubmit={(e) => {
          void send(e);
        }}
        className="mt-4 shrink-0 border-t border-line pt-4"
        noValidate
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          data-testid="chat-input"
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(e);
          }}
          aria-invalid={Boolean(invalid) || tooLong}
          aria-describedby={invalid ? 'chat-input-error' : undefined}
          placeholder="What does the Pro plan cost?"
          className="w-full resize-none border border-line bg-panel px-3 py-2.5 text-sm text-text placeholder:text-faint focus-visible:border-signal/60 focus-visible:ring-1 focus-visible:ring-signal/40 focus-visible:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-[11px] text-faint">
            {invalid ? (
              <span id="chat-input-error" data-testid="chat-validation" className="text-amber">
                {invalid}
              </span>
            ) : (
              <CharCount
                testId="chat-charcount"
                length={input.length}
                max={LIMITS.message}
                hint="⌘↵ to send"
              />
            )}
          </div>
          <SubmitButton testId="chat-send" busy={loading} idle="send" pending="sending…" />
        </div>
      </form>
    </section>
  );
}
