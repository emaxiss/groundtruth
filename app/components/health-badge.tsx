'use client';

import { useEffect, useState } from 'react';

import { HealthResponse } from '@/lib/schemas';

export function HealthBadge() {
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
    <div className="flex items-center gap-3 text-[11px] text-faint" data-testid="health-badge">
      {health ? (
        <>
          <span data-testid="health-model">
            {health.fake_llm ? 'FAKE_LLM' : (health.model ?? 'unknown')}
          </span>
          <span aria-hidden="true">·</span>
          <span>{health.corpus_docs} docs</span>
          <span className="size-1.5 rounded-full bg-signal" aria-label="API reachable" role="img" />
        </>
      ) : (
        <span data-testid="health-offline">api offline</span>
      )}
    </div>
  );
}
