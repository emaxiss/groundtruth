'use client';

import { useState } from 'react';

import { LIMITS } from '@/lib/limits';
import { ApiErrorResponse, CUSTOMER_PLANS, TriageOutput } from '@/lib/schemas';

import {
  CharCount,
  EmptyState,
  ErrorAlert,
  fieldClass,
  PendingRow,
  SubmitButton,
} from './primitives';

type Plan = (typeof CUSTOMER_PLANS)[number];
type FieldErrors = Partial<Record<'subject' | 'body', string>>;

const SEVERITY_TONE: Record<TriageOutput['severity'], string> = {
  low: 'text-dim',
  medium: 'text-amber',
  high: 'text-alarm',
  critical: 'text-alarm',
};

function refundLabel(value: TriageOutput['refund_eligible']) {
  if (value === 'needs_review') return { text: 'needs review', tone: 'text-amber' };
  return value ? { text: 'yes', tone: 'text-signal' } : { text: 'no', tone: 'text-dim' };
}

export function TriagePanel() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [plan, setPlan] = useState<Plan>('free');
  const [result, setResult] = useState<TriageOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<FieldErrors>({});

  const bodyTooLong = body.length > LIMITS.body;
  const subjectTooLong = subject.length > LIMITS.subject;

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!subject.trim()) errors.subject = 'Enter a subject.';
    else if (subjectTooLong)
      errors.subject = `Subject must be ${LIMITS.subject} characters or fewer.`;
    if (!body.trim()) errors.body = 'Enter the ticket body.';
    else if (bodyTooLong) errors.body = `Body must be ${LIMITS.body} characters or fewer.`;
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
                <CharCount
                  testId="triage-charcount"
                  length={body.length}
                  max={LIMITS.body}
                  hint="⌘↵ to classify"
                />
              )}
            </div>
            <SubmitButton
              testId="triage-submit"
              busy={loading}
              idle="classify"
              pending="classifying…"
            />
          </div>
        </div>
      </form>

      <div className="mt-5 border-t border-line pt-5" aria-live="polite" aria-busy={loading}>
        {loading && <PendingRow testId="triage-loading" label="classifying ticket…" />}

        {error && <ErrorAlert testId="triage-error" message={error} />}

        {!loading && !error && !result && (
          <EmptyState testId="triage-empty">
            No classification yet. Submit a ticket to see category, severity, routing, and a drafted
            reply.
          </EmptyState>
        )}

        {result && refund && (
          <article className="gt-rise" data-testid="triage-result" aria-label="Classification">
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
