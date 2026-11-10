import type { Metadata } from 'next';
import { IntelBlockList } from '@/components/intel/IntelBlocks';
import { FtoList } from '@/components/intel/FtoList';
import { NewsList } from '@/components/intel/NewsList';
import { filterPatentRows, parsePatentSec, type PatentSec } from '@/lib/intel-utils';
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

function Sections({
  rows,
  sectionLabel,
  stripWords,
}: {
  rows: BlockRow[];
  sectionLabel?: string;
  stripWords?: string[];
}) {
  return (
    <div className="space-y-4">
      <IntelBlockList
        blocks={rows.map((r) => r.payload)}
        sectionLabel={sectionLabel}
        stripWords={stripWords}
      />
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
      {rows.length ? (
        <Sections rows={rows} sectionLabel="경쟁사 비교" stripWords={['경쟁사', '비교']} />
      ) : (
        <Empty error={error} />
      )}
    </>
  );
}

// The proposals view drops the methodology name from headings/tab labels (render-level only).
const PROPOSALS_STRIP_WORDS = ['TRIZ 기반', 'TRIZ'];

async function PatentsTab({ sec }: { sec: PatentSec | null }) {
  const [allBlocks, allFto] = await Promise.all([loadBlocks('intel_patents'), loadFto()]);
  const blocks = { ...allBlocks, rows: filterPatentRows(allBlocks.rows, sec) };
  // FTO 1차 검토 DB is competitor-facing: shown in the all view and the 경쟁사 view only.
  const fto = !sec || sec === 'competitor' ? allFto : { ...allFto, rows: [] };
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
      <Sections
        rows={blocks.rows}
        sectionLabel="특허 분석"
        stripWords={sec === 'proposals' ? PROPOSALS_STRIP_WORDS : undefined}
      />
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

export default async function IntelPage({ searchParams }: { searchParams: Promise<{ tab?: string; sec?: string }> }) {
  const { tab, sec } = await searchParams;
  const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'news';

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight">
        {TABS.find((t) => t.key === active)?.label}
      </h1>

      <div className="space-y-4">
        {active === 'news' && <NewsTab />}
        {active === 'competitors' && <CompetitorsTab />}
        {active === 'patents' && <PatentsTab sec={parsePatentSec(sec)} />}
      </div>
    </div>
  );
}
