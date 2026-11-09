'use client';

import { useState, type ReactNode } from 'react';

// Client-side tab switcher for a `tabs` block. Panels are rendered on the server
// and passed in as children, so this only toggles visibility.
export function IntelTabs({ labels, panels }: { labels: string[]; panels: ReactNode[] }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-border/70">
        {labels.map((label, i) => (
          <button
            key={label + i}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active === i
                ? 'border-[hsl(var(--brass))] text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div key={i} role="tabpanel" hidden={active !== i}>
          {panel}
        </div>
      ))}
    </div>
  );
}
