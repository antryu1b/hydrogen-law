import type { Metadata } from 'next';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { IntelBlockList } from '@/components/intel/IntelBlocks';
import { FtoList } from '@/components/intel/FtoList';
import { NewsList } from '@/components/intel/NewsList';
import { formatKst, loadBlocks, loadFto, loadNews, type BlockRow } from '@/lib/intel';

export const metadata: Metadata = { title: '수전해 인텔리전스' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'news', label: '수전해 동향' },
  { key: 'competitors', label: '경쟁사 비교' },
  { key: 'patents', label: '특허 분석' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function UpdatedAt({ iso, note }: { iso: string | null; note?: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      마지막 갱신 <span className="font-medium tabular-nums text-foreground">{formatKst(iso)}</span>
      {note ? ` · ${note}` : ''}
    </p>
  );
}

function Empty({ error }: { error: string | null }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {error ?? '아직 데이터가 없습니다.'}
    </div>
  );
}

function Sections({ rows }: { rows: BlockRow[] }) {
  return (
    <div className="space-y-4">
      <IntelBlockList blocks={rows.map((r) => r.payload)} />
    </div>
  );
}

async function NewsTab() {
  const { rows, lastUpdated, error } = await loadNews();
  return (
    <>
      <UpdatedAt iso={lastUpdated} note="매일 1회 Google News RSS 자동 수집" />
      {rows.length ? <NewsList rows={rows} /> : <Empty error={error} />}
    </>
  );
}

async function CompetitorsTab() {
  const { rows, lastUpdated, error } = await loadBlocks('intel_competitors');
  return (
    <>
      <UpdatedAt iso={lastUpdated} />
      {rows.length ? <Sections rows={rows} /> : <Empty error={error} />}
    </>
  );
}

async function PatentsTab() {
  const [blocks, fto] = await Promise.all([loadBlocks('intel_patents'), loadFto()]);
  const lastUpdated = [blocks.lastUpdated, fto.lastUpdated].filter(Boolean).sort().pop() ?? null;
  if (!blocks.rows.length && !fto.rows.length) {
    return (
      <>
        <UpdatedAt iso={lastUpdated} />
        <Empty error={blocks.error ?? fto.error} />
      </>
    );
  }
  return (
    <>
      <UpdatedAt iso={lastUpdated} />
      <Sections rows={blocks.rows} />
      {fto.rows.length > 0 && (
        <div className="space-y-3">
          <div className="mt-8 border-b border-border/70 pb-2">
            <h2 className="font-display text-lg font-bold tracking-tight">FTO 1차 검토 DB</h2>
            <p className="mt-1 text-sm text-muted-foreground">검토 대상 특허 전건 · 분류·판정·검색 필터</p>
          </div>
          <FtoList records={fto.rows} />
        </div>
      )}
    </>
  );
}

export default async function IntelPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'news';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">수전해 인텔리전스</h1>
          <p className="mt-1 text-sm text-muted-foreground">수전해 동향 · 경쟁사 비교 · 특허 분석</p>
        </div>
        <Link
          href="/intel/admin"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Upload className="h-3.5 w-3.5" /> 데이터 업로드
        </Link>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-border/70" aria-label="인텔리전스 탭">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/intel?tab=${t.key}`}
            aria-current={active === t.key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              active === t.key
                ? 'border-[hsl(var(--brass))] text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="space-y-4">
        {active === 'news' && <NewsTab />}
        {active === 'competitors' && <CompetitorsTab />}
        {active === 'patents' && <PatentsTab />}
      </div>
    </div>
  );
}
