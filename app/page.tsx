'use client';

import { useEffect, useRef, useState } from 'react';

import {
  ApiErrorResponse,
  ChatResponse,
  CUSTOMER_PLANS,
  HealthResponse,
  TriageOutput,
} from '@/lib/schemas';

type Msg = { role: 'user' | 'agent'; text: string };

const MAX_CHARS = 2000;
const MAX_SUBJECT = 200;

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
          TaskLoop support agent. The system under test for the eval harness in{' '}
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

      {tab === 'chat' ? <ChatPanel /> : <TriagePanel />}
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

type Plan = (typeof CUSTOMER_PLANS)[number];
type TriageFieldErrors = Partial<Record<'subject' | 'body', string>>;

const SEVERITY_TONE: Record<TriageOutput['severity'], string> = {
  low: 'text-dim',
  medium: 'text-amber',
  high: 'text-alarm',
  critical: 'text-alarm',
};

const fieldClass =
  'w-full border border-line bg-panel px-3 py-2.5 text-sm text-text placeholder:text-faint focus-visible:border-signal/60 focus-visible:ring-1 focus-visible:ring-signal/40 focus-visible:outline-none';

function refundLabel(value: TriageOutput['refund_eligible']) {
  if (value === 'needs_review') return { text: 'needs review', tone: 'text-amber' };
  return value ? { text: 'yes', tone: 'text-signal' } : { text: 'no', tone: 'text-dim' };
}

function TriagePanel() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [plan, setPlan] = useState<Plan>('free');
  const [result, setResult] = useState<TriageOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<TriageFieldErrors>({});

  const bodyTooLong = body.length > MAX_CHARS;
  const subjectTooLong = subject.length > MAX_SUBJECT;

  function validate(): TriageFieldErrors {
    const errors: TriageFieldErrors = {};
    if (!subject.trim()) errors.subject = 'Enter a subject.';
    else if (subjectTooLong) errors.subject = `Subject must be ${MAX_SUBJECT} characters or fewer.`;
    if (!body.trim()) errors.body = 'Enter the ticket body.';
    else if (bodyTooLong) errors.body = `Body must be ${MAX_CHARS} characters or fewer.`;
    return errors;
  }

  async function classify(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate();
    setInvalid(errors);
    if (Object.keys(errors).length > 0) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), customer_plan: plan }),
      });
      const payload: unknown = await res.json();
      if (!res.ok) {
        const err = ApiErrorResponse.safeParse(payload);
        setError(err.success ? err.data.error : `Request failed (${res.status})`);
        return;
      }
      const parsed = TriageOutput.safeParse(payload);
      if (!parsed.success) {
        setError('The server returned an unexpected response.');
        return;
      }
      setResult(parsed.data);
    } catch {
      setError('Could not reach the API. Is the dev server running?');
    } finally {
      setLoading(false);
    }
  }

  const refund = result ? refundLabel(result.refund_eligible) : null;

  return (
    <section
      role="tabpanel"
      id="panel-triage"
      aria-labelledby="tab-triage"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1"
      data-testid="triage-panel"
    >
      <form
        onSubmit={(e) => {
          void classify(e);
        }}
        className="shrink-0 space-y-3"
        noValidate
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <div>
            <label htmlFor="triage-subject" className="gt-label">
              subject
            </label>
            <input
              id="triage-subject"
              data-testid="triage-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-invalid={Boolean(invalid.subject) || subjectTooLong}
              aria-describedby={invalid.subject ? 'triage-subject-error' : undefined}
              placeholder="Refund for annual charge"
              className={fieldClass}
            />
            {invalid.subject && (
              <p
                id="triage-subject-error"
                data-testid="triage-subject-validation"
                className="mt-1.5 text-[11px] text-amber"
              >
                {invalid.subject}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="triage-plan" className="gt-label">
              customer plan
            </label>
            <select
              id="triage-plan"
              data-testid="triage-plan"
              value={plan}
              onChange={(e) => setPlan(e.target.value as Plan)}
              className={`${fieldClass} cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%237d928d' stroke-width='1.5'/%3E%3C/svg%3E")] bg-[length:10px_6px] bg-[position:right_0.75rem_center] bg-no-repeat pr-8`}
            >
              {CUSTOMER_PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="triage-body" className="gt-label">
            body
          </label>
          <textarea
            id="triage-body"
            data-testid="triage-body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void classify(e);
            }}
            aria-invalid={Boolean(invalid.body) || bodyTooLong}
            aria-describedby={invalid.body ? 'triage-body-error' : undefined}
            placeholder="I was charged for the annual plan last month and would like a refund."
            className={`${fieldClass} resize-none`}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-[11px] text-faint">
              {invalid.body ? (
                <span
                  id="triage-body-error"
                  data-testid="triage-body-validation"
                  className="text-amber"
                >
                  {invalid.body}
                </span>
              ) : (
                <span
                  data-testid="triage-charcount"
                  className={bodyTooLong ? 'text-alarm' : undefined}
                >
                  {body.length}/{MAX_CHARS} · ⌘↵ to classify
                </span>
              )}
            </div>
            <button
              type="submit"
              data-testid="triage-submit"
              disabled={loading}
              className="border border-signaldim bg-signaldim/20 px-4 py-1.5 text-xs tracking-wider text-signal uppercase transition-colors duration-150 hover:bg-signaldim/40 focus-visible:ring-1 focus-visible:ring-signal focus-visible:outline-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'classifying…' : 'classify'}
            </button>
          </div>
        </div>
      </form>

      <div className="mt-5 border-t border-line pt-5" aria-live="polite" aria-busy={loading}>
        {loading && (
          <div
            className="flex items-center gap-2 border border-line bg-panel px-4 py-3 text-xs text-dim"
            data-testid="triage-loading"
          >
            <span className="gt-blink text-signal">▍</span> classifying ticket…
          </div>
        )}

        {error && (
          <div
            role="alert"
            data-testid="triage-error"
            className="gt-rise flex items-start gap-2 border border-alarm/60 bg-alarm/15 px-4 py-2.5 text-xs leading-relaxed text-[#ff9ba0]"
          >
            <span aria-hidden="true" className="text-alarm">
              ▲
            </span>
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && !result && (
          <div
            className="border border-dashed border-line px-4 py-8 text-center text-xs text-faint"
            data-testid="triage-empty"
          >
            No classification yet. Submit a ticket to see category, severity, routing, and a drafted
            reply.
          </div>
        )}

        {result && refund && (
          <article className="gt-rise" data-testid="triage-result">
            <dl className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-5">
              <div className="border-r border-b border-line px-3 py-2.5">
                <dt className="gt-label">category</dt>
                <dd data-testid="triage-category" className="text-sm text-text">
                  {result.category.replace('_', ' ')}
                </dd>
              </div>
              <div className="border-r border-b border-line px-3 py-2.5">
                <dt className="gt-label">severity</dt>
                <dd
                  data-testid="triage-severity"
                  className={`text-sm ${SEVERITY_TONE[result.severity]}`}
                >
                  {result.severity}
                </dd>
              </div>
              <div className="border-r border-b border-line px-3 py-2.5">
                <dt className="gt-label">route to</dt>
                <dd data-testid="triage-route" className="text-sm text-text">
                  {result.route_to.replace('_', ' ')}
                </dd>
              </div>
              <div className="border-r border-b border-line px-3 py-2.5">
                <dt className="gt-label">refund eligible</dt>
                <dd data-testid="triage-refund" className={`text-sm ${refund.tone}`}>
                  {refund.text}
                </dd>
              </div>
              <div className="col-span-2 border-r border-b border-line px-3 py-2.5 sm:col-span-1">
                <dt className="gt-label">confidence</dt>
                <dd data-testid="triage-confidence" className="text-sm text-text">
                  {result.confidence.toFixed(2)}
                  <span className="mt-1.5 block h-px w-full bg-line" aria-hidden="true">
                    <span
                      className="block h-px bg-signal"
                      style={{ width: `${Math.round(result.confidence * 100)}%` }}
                    />
                  </span>
                </dd>
              </div>
            </dl>
            <div className="mt-3 border border-signaldim/40 bg-raised px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-text">
              <div className="mb-1.5 text-[10px] tracking-[0.18em] text-faint uppercase">
                suggested reply
              </div>
              <p data-testid="triage-reply">{result.suggested_reply}</p>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

export default Page;
