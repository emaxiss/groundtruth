import type { ReactNode } from 'react';

// The small pieces both panels share, so the chat and triage views cannot
// drift in copy, markup, or test ids.

export const fieldClass =
  'w-full border border-line bg-panel px-3 py-2.5 text-sm text-text placeholder:text-faint focus-visible:border-signal/60 focus-visible:ring-1 focus-visible:ring-signal/40 focus-visible:outline-none';

export function SubmitButton({
  testId,
  busy,
  idle,
  pending,
}: {
  testId: string;
  busy: boolean;
  idle: string;
  pending: string;
}) {
  return (
    <button
      type="submit"
      data-testid={testId}
      disabled={busy}
      className="border border-signaldim bg-signaldim/20 px-4 py-1.5 text-xs tracking-wider text-signal uppercase transition-colors duration-150 hover:bg-signaldim/40 focus-visible:ring-1 focus-visible:ring-signal focus-visible:outline-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? pending : idle}
    </button>
  );
}

export function ErrorAlert({
  testId,
  message,
  className = '',
}: {
  testId: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={`gt-rise flex items-start gap-2 border border-alarm/60 bg-alarm/15 px-4 py-2.5 text-xs leading-relaxed text-[#ff9ba0] ${className}`}
    >
      <span aria-hidden="true" className="text-alarm">
        ▲
      </span>
      <span>{message}</span>
    </div>
  );
}

export function PendingRow({ testId, label }: { testId: string; label: string }) {
  return (
    <div
      className="flex items-center gap-2 border border-line bg-panel px-4 py-3 text-xs text-dim"
      data-testid={testId}
    >
      <span className="gt-blink text-signal">▍</span> {label}
    </div>
  );
}

export function EmptyState({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div
      className="border border-dashed border-line px-4 py-8 text-center text-xs text-faint"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function CharCount({
  testId,
  length,
  max,
  hint,
}: {
  testId: string;
  length: number;
  max: number;
  hint: string;
}) {
  return (
    <span data-testid={testId} className={length > max ? 'text-alarm' : undefined}>
      {length}/{max} · {hint}
    </span>
  );
}
