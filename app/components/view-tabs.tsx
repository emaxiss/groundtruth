export const VIEWS = ['chat', 'triage'] as const;
export type View = (typeof VIEWS)[number];

export function ViewTabs({ active, onChange }: { active: View; onChange: (view: View) => void }) {
  return (
    <nav className="mb-5 flex shrink-0 gap-1" role="tablist" aria-label="Views">
      {VIEWS.map((view) => (
        <button
          key={view}
          role="tab"
          id={`tab-${view}`}
          aria-selected={active === view}
          aria-controls={`panel-${view}`}
          data-testid={`tab-${view}`}
          onClick={() => onChange(view)}
          className={`border px-3 py-1.5 text-xs tracking-wider uppercase transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-signal focus-visible:outline-none ${
            active === view
              ? 'border-line bg-raised text-signal'
              : 'border-transparent text-faint hover:text-dim'
          }`}
        >
          {view}
        </button>
      ))}
    </nav>
  );
}
