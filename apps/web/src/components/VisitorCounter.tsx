'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';

interface Visits {
  today: number;
  total: number;
}

// Header visitor counter — eye icon + today / cumulative counts.
// Increments once per browser session (sessionStorage guard); reads only
// on subsequent mounts within the same session.
export function VisitorCounter() {
  const [visits, setVisits] = useState<Visits | null>(null);

  useEffect(() => {
    const KEY = 'hl-visit-counted';
    const alreadyCounted =
      typeof window !== 'undefined' && window.sessionStorage.getItem(KEY);

    fetch('/api/visits', { method: alreadyCounted ? 'GET' : 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Visits | null) => {
        if (data) {
          setVisits(data);
          if (!alreadyCounted) window.sessionStorage.setItem(KEY, '1');
        }
      })
      .catch(() => {
        /* counter is non-critical — stay silent on failure */
      });
  }, []);

  if (!visits) return null;

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  return (
    <span
      className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground sm:flex"
      title={`오늘 방문자 ${fmt(visits.today)}명 · 누적 ${fmt(visits.total)}명`}
    >
      <Eye className="h-3.5 w-3.5 text-[hsl(var(--brass))]" strokeWidth={1.75} />
      <span className="tabular-nums">
        오늘 <span className="text-foreground">{fmt(visits.today)}</span>
        <span className="mx-1 text-border">·</span>
        누적 <span className="text-foreground">{fmt(visits.total)}</span>
      </span>
    </span>
  );
}
