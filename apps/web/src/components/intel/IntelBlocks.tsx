import { ChevronDown } from 'lucide-react';
import { safeHref, type IntelBlock, type IntelLink, type TableCell } from '@/lib/intel';
import { IntelTabs } from './IntelTabs';
import { stripSectionWords } from '@/lib/intel-utils';

// Renders the generic content blocks stored in intel_competitors / intel_patents.
// Everything is rendered as text (no raw HTML), so uploaded JSON cannot inject markup.

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-[hsl(var(--brass)/0.35)] bg-[hsl(var(--brass)/0.10)] px-1.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--brass))]">
      {children}
    </span>
  );
}

function Links({ links }: { links?: IntelLink[] }) {
  const valid = (links ?? []).filter((l) => safeHref(l.url));
  if (!valid.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {valid.map((l, i) => (
        <a
          key={l.url + i}
          href={safeHref(l.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[hsl(var(--brass))] underline-offset-2 hover:underline"
        >
          {l.label}
        </a>
      ))}
    </span>
  );
}

function Cell({ cell, header, hlCol, col }: { cell: TableCell; header?: boolean; hlCol?: number; col: number }) {
  const [main, ...rest] = (cell.t || '').split('\n');
  const hl = cell.hl || (hlCol !== undefined && col === hlCol);
  const cls = [
    'border-b border-border/60 px-3 py-2 align-top whitespace-pre-line',
    col === 0 ? 'font-medium text-left' : 'text-center',
    hl ? 'bg-[hsl(var(--brass)/0.07)]' : '',
    cell.best ? 'bg-emerald-500/10' : '',
    cell.zero ? 'text-destructive font-semibold' : '',
  ].join(' ');
  return (
    <td className={cls} colSpan={cell.span}>
      <span className={hl || cell.best ? 'font-semibold' : undefined}>{main || (header ? '' : '—')}</span>
      {cell.best && (
        <span className="ml-1 rounded bg-emerald-600/15 px-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          {cell.best}
        </span>
      )}
      {rest.length > 0 && <span className="mt-0.5 block text-[11px] text-muted-foreground">{rest.join('\n')}</span>}
      <Links links={cell.links} />
    </td>
  );
}

export function IntelBlockView({
  block,
  stripWords,
}: {
  block: IntelBlock;
  stripWords?: string[];
}) {
  const st = (title: string) =>
    stripWords?.length ? stripSectionWords(title, stripWords) : title;

  switch (block.type) {
    case 'heading':
      return (
        <div className="mt-8 border-b border-border/70 pb-2 first:mt-0">
          <h2 className="font-display text-lg font-bold tracking-tight">{st(block.title)}</h2>
          {block.desc && <p className="mt-1 text-sm text-muted-foreground">{block.desc}</p>}
        </div>
      );
    case 'text':
      return (
        <div
          className={
            block.tone === 'info'
              ? 'rounded-md border-l-[3px] border-[hsl(var(--brass))] bg-secondary/60 px-4 py-3 text-sm leading-relaxed'
              : 'text-sm leading-relaxed text-muted-foreground'
          }
        >
          <p className="whitespace-pre-line">{block.text}</p>
          <Links links={block.links} />
        </div>
      );
    case 'line':
      return (
        <div className={`flex flex-wrap items-center gap-2 text-sm ${block.strong ? 'font-semibold' : ''}`}>
          {block.badges?.map((b, i) => <Badge key={b + i}>{b}</Badge>)}
          {block.text && <span className="whitespace-pre-line">{block.text}</span>}
          <Links links={block.links} />
        </div>
      );
    case 'kv':
      return (
        <div className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-border/40 py-1.5 text-sm last:border-0">
          <span className="font-medium text-muted-foreground">{block.label}</span>
          <span className="whitespace-pre-line">
            {block.text}
            <Links links={block.links} />
          </span>
        </div>
      );
    case 'list':
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'stats':
      return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {block.items.map((s, i) => (
            <div key={s.label + i} className="rounded-lg border border-border/80 bg-card p-4">
              <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{s.value}</div>
              {s.desc && <div className="mt-1 text-xs text-muted-foreground">{s.desc}</div>}
            </div>
          ))}
        </div>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-lg border border-border/80 bg-card">
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            {block.headers.length > 0 && (
              <thead>
                <tr className="bg-secondary/60">
                  {block.headers.map((h, i) => (
                    <th
                      key={i}
                      className={`whitespace-pre-line border-b border-border px-3 py-2 font-semibold ${
                        i === 0 ? 'text-left' : 'text-center'
                      } ${i === block.hlCol ? 'text-[hsl(var(--brass))]' : ''}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="hover:bg-accent/30">
                  {row.map((cell, c) => (
                    <Cell key={c} cell={cell} col={c} hlCol={block.hlCol} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'card':
      if (!block.blocks?.length) return null;
      return (
        <div className="space-y-2 rounded-lg border border-border/80 bg-card p-5">
          <IntelBlockList blocks={block.blocks} stripWords={stripWords} />
        </div>
      );
    case 'details':
      return (
        <details className="group rounded-lg border border-border/80 bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
            {block.badges?.map((b, i) => <Badge key={b + i}>{b}</Badge>)}
            <span className="flex-1">{st(block.title)}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t border-border/60 px-4 py-3">
            <IntelBlockList blocks={block.blocks} stripWords={stripWords} />
          </div>
        </details>
      );
    case 'tabs':
      return (
        <IntelTabs
          labels={block.tabs.map((t) => st(t.label))}
          panels={block.tabs.map((t, i) => (
            <div key={i} className="space-y-3">
              <IntelBlockList blocks={t.blocks} stripWords={stripWords} />
            </div>
          ))}
        />
      );
    default:
      return null;
  }
}

/**
 * Renders a list of intel blocks.
 * @param sectionLabel - If provided, skip any leading `heading` block whose
 *   title equals or starts with this label (deduplication when content data
 *   repeats the section name already shown as the page h1).
 */
export function IntelBlockList({
  blocks,
  sectionLabel,
  stripWords,
}: {
  blocks: IntelBlock[];
  /** Skip any heading whose title starts with this label (data-side deduplication). */
  sectionLabel?: string;
  /** Strip these words from headings and sub-tab labels (competitors section). */
  stripWords?: string[];
}) {
  return (
    <>
      {blocks.map((b, i) => {
        if (
          sectionLabel &&
          b.type === 'heading' &&
          b.title &&
          b.title.trim().startsWith(sectionLabel.trim())
        ) {
          return null;
        }
        return <IntelBlockView key={i} block={b} stripWords={stripWords} />;
      })}
    </>
  );
}
