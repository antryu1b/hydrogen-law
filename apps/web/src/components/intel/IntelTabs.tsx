'use client';

import { useState, type ReactNode } from 'react';

// Client-side tab switcher for a `tabs` block. Panels are rendered on the server
// and passed in as children, so this only toggles visibility.
// dividers[i] draws a vertical rule before tab i (on the tab itself, so it wraps with it) to separate tab groups.
export function IntelTabs({
  labels,
  panels,
  dividers,
}: {
  labels: string[];
  panels: ReactNode[];
  dividers?: boolean[];
}) {
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
              dividers?.[i] ? 'relative ml-3 before:absolute before:-left-2 before:top-2 before:bottom-2 before:w-px before:bg-border before:content-[""]' : ''
            } ${
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
