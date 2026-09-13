'use client';

import { useEffect, useRef, useState } from 'react';

import { ApiErrorResponse, ChatResponse, HealthResponse } from '@/lib/schemas';

type Msg = { role: 'user' | 'agent'; text: string };

const MAX_CHARS = 2000;

export function Page() {
  const [tab, setTab] = useState<'chat' | 'triage'>('chat');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) return setHealth(null);
        const parsed = HealthResponse.safeParse(await res.json());
        setHealth(parsed.success ? parsed.data : null);
      } catch {
        setHealth(null);
      }
    };
    void load();
  }, []);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-5 py-8" data-testid="app-root">
      <header className="mb-6 shrink-0 border-b border-line pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-sm tracking-[0.2em] text-signal uppercase">groundtruth</h1>
          <div
            className="flex items-center gap-3 text-[11px] text-faint"
            data-testid="health-badge"
          >
            {health ? (
              <>
                <span data-testid="health-model">
                  {health.fake_llm ? 'FAKE_LLM' : (health.model ?? 'unknown')}
                </span>
                <span aria-hidden="true">·</span>
                <span>{health.corpus_docs} docs</span>
                <span
                  className="size-1.5 rounded-full bg-signal"
                  aria-label="API reachable"
                  role="img"
                />
              </>
            ) : (
              <span data-testid="health-offline">api offline</span>
            )}
          </div>
        </div>
        <p className="mt-3.5 max-w-xl text-xs leading-relaxed text-dim">
          TaskLoop support agent. System under test for the DeepEval harness in{' '}
          <span className="text-faint">evals/</span>.
        </p>
      </header>

      <nav className="mb-5 flex shrink-0 gap-1" role="tablist" aria-label="Views">
        {(['chat', 'triage'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            data-testid={`tab-${t}`}
            onClick={() => setTab(t)}
            className={`border px-3 py-1.5 text-xs tracking-wider uppercase transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-signal focus-visible:outline-none ${
              tab === t
                ? 'border-line bg-raised text-signal'
                : 'border-transparent text-faint hover:text-dim'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'chat' ? <ChatPanel /> : <TriagePlaceholder />}
    </main>
  );
}

function ChatPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, loading]);

  const tooLong = input.length > MAX_CHARS;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message) {
      setInvalid('Enter a message before sending.');
      return;
    }
    if (tooLong) {
      setInvalid(`Message must be ${MAX_CHARS} characters or fewer.`);
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
        body: JSON.stringify({ message }),
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
          <div
            className="border border-dashed border-line px-4 py-8 text-center text-xs text-faint"
            data-testid="chat-empty"
          >
            No messages yet. Ask about plans, refunds, limits, or integrations.
          </div>
        )}

        {msgs.map((m, i) => (
          <article
            key={i}
            data-testid={m.role === 'user' ? 'msg-user' : 'msg-agent'}
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

        {loading && (
          <div
            className="flex items-center gap-2 border border-line bg-panel px-4 py-3 text-xs text-dim"
            data-testid="chat-loading"
          >
            <span className="gt-blink text-signal">▍</span> agent is responding…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <div
          role="alert"
          data-testid="chat-error"
          className="gt-rise mt-3 flex items-start gap-2 border border-alarm/60 bg-alarm/15 px-4 py-2.5 text-xs leading-relaxed text-[#ff9ba0]"
        >
          <span aria-hidden="true" className="text-alarm">
            ▲
          </span>
          <span>{error}</span>
        </div>
      )}

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
              <span data-testid="chat-charcount" className={tooLong ? 'text-alarm' : undefined}>
                {input.length}/{MAX_CHARS} · ⌘↵ to send
              </span>
            )}
          </div>
          <button
            type="submit"
            data-testid="chat-send"
            disabled={loading}
            className="border border-signaldim bg-signaldim/20 px-4 py-1.5 text-xs tracking-wider text-signal uppercase transition-colors duration-150 hover:bg-signaldim/40 focus-visible:ring-1 focus-visible:ring-signal focus-visible:outline-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? 'sending…' : 'send'}
          </button>
        </div>
      </form>
    </section>
  );
}

function TriagePlaceholder() {
  return (
    <section
      role="tabpanel"
      id="panel-triage"
      aria-labelledby="tab-triage"
      className="border border-dashed border-line px-4 py-8 text-center text-xs text-faint"
      data-testid="triage-placeholder"
    >
      Ticket triage is not available yet.
    </section>
  );
}

export default Page;
