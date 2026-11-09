import { safeHref, type NewsRow } from '@/lib/intel';

const CATEGORY_ORDER = ['정책', '기술', '경쟁사'];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function NewsItem({ item }: { item: NewsRow }) {
  const href = safeHref(item.url);
  const variants = item.payload?.variants ?? [];
  const publisher = item.payload?.publisher || (href ? hostOf(href) : '');
  return (
    <li className="border-b border-border/50 py-2 last:border-0">
      <div className="flex gap-3 text-sm">
        <span className="w-[5.5rem] shrink-0 tabular-nums text-muted-foreground">{item.published_at ?? '—'}</span>
        <div className="min-w-0 flex-1">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-[hsl(var(--brass))] hover:underline">
              {item.title}
            </a>
          ) : (
            <span>{item.title}</span>
          )}
          {publisher && <span className="ml-2 text-xs text-muted-foreground">{publisher}</span>}
          {item.source === 'rss' && (
            <span className="ml-2 rounded bg-secondary px-1 text-[10px] text-muted-foreground">자동수집</span>
          )}
          {variants.length > 0 && (
            <details className="mt-1 text-xs text-muted-foreground">
              <summary className="cursor-pointer">같은 기사 다른 요약 {variants.length}건</summary>
              <ul className="mt-1 space-y-0.5 pl-3">
                {variants.map((v, i) => (
                  <li key={i}>
                    <span className="tabular-nums">{v.date ?? '—'}</span> · {v.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

export function NewsList({ rows }: { rows: NewsRow[] }) {
  const byCategory = new Map<string, NewsRow[]>();
  for (const r of rows) {
    const cat = r.category || '기타';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }
  const categories = [...byCategory.keys()].sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99),
  );

  return (
    <div className="space-y-6">
      {categories.map((cat) => {
        const items = byCategory.get(cat)!;
        const byCompany = new Map<string, NewsRow[]>();
        for (const it of items) {
          const co = it.company || '';
          if (!byCompany.has(co)) byCompany.set(co, []);
          byCompany.get(co)!.push(it);
        }
        return (
          <section key={cat} className="rounded-lg border border-border/80 bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold">
              {cat}
              <span className="text-xs font-normal text-muted-foreground">{items.length}건</span>
            </h2>
            <div className="space-y-4">
              {[...byCompany.entries()].map(([co, list]) => (
                <div key={co || '_'}>
                  {co && (
                    <h3 className="mb-1 text-sm font-semibold text-[hsl(var(--brass))]">
                      {co} <span className="text-xs font-normal text-muted-foreground">{list.length}건</span>
                    </h3>
                  )}
                  <ul>
                    {list.map((it) => (
                      <NewsItem key={it.url} item={it} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
