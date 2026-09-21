'use client';

import { useState } from 'react';

import { ChatPanel } from './components/chat-panel';
import { HealthBadge } from './components/health-badge';
import { TriagePanel } from './components/triage-panel';
import { type View, ViewTabs } from './components/view-tabs';

export function Page() {
  const [view, setView] = useState<View>('chat');

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-5 py-8" data-testid="app-root">
      <header className="mb-6 shrink-0 border-b border-line pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-sm tracking-[0.2em] text-signal uppercase">groundtruth</h1>
          <HealthBadge />
        </div>
        <p className="mt-3.5 max-w-xl text-xs leading-relaxed text-dim">
          TaskLoop support agent. The system under test for the eval harness in{' '}
          <span className="text-faint">evals/</span>.
        </p>
      </header>

      <ViewTabs active={view} onChange={setView} />

      {view === 'chat' ? <ChatPanel /> : <TriagePanel />}
    </main>
  );
}

export default Page;
