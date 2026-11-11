import type { Metadata } from 'next';
import { IntelBlockList } from '@/components/intel/IntelBlocks';
import { FtoList } from '@/components/intel/FtoList';
import { NewsList } from '@/components/intel/NewsList';
import { CompetitorPatentStats } from '@/components/intel/PatentWatch';
import { PatentWatchList } from '@/components/intel/PatentWatchList';
import { filterPatentRows, parsePatentSec, stripSectionWords, type PatentSec } from '@/lib/intel-utils';
import {
  formatKst,
  loadBlocks,
  loadCompetitorPatents,
  loadFto,
  loadNews,
  loadPatentWatch,
  PATENT_WATCH_MAX,
  type BlockRow,
  type IntelBlock,
} from '@/lib/intel';
import { aggregateCompetitorStats } from '@/lib/patent-watch';

export const metadata: Metadata = { title: '수전해 인텔리전스' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'news', label: '수전해 동향' },
  { key: 'competitors', label: '경쟁사 비교' },
  { key: 'patents', label: '특허 분석' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const PATENT_SEC_TITLES: Partial<Record<PatentSec, string>> = {
  competitor: '경쟁사 특허검토',
  hmg: '현대차그룹 특허검토',
  proposals: '특허제안리스트',
};

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
  const { rows, error } = await loadNews();
  // Rows are ordered by published_at desc, so the first row is the newest article.
  const latestPublished = rows[0]?.published_at ?? null;
  return (
    <>
      <p className="text-xs text-muted-foreground">
        최신 기사 발행일 <span className="font-medium tabular-nums text-foreground">{latestPublished ?? '—'}</span>
        {' · 매일 1회 Google News RSS 자동 수집'}
      </p>
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

// Heading subtitles (desc) are not covered by stripWords, so clean them here for the proposals view.
function stripHeadingDescs(block: IntelBlock, words: string[]): IntelBlock {
  if (block.type === 'heading' && block.desc) return { ...block, desc: stripSectionWords(block.desc, words) };
  if (block.type === 'card' || block.type === 'details')
    return { ...block, blocks: block.blocks?.map((b) => stripHeadingDescs(b, words)) } as IntelBlock;
  if (block.type === 'tabs')
    return { ...block, tabs: block.tabs.map((tb) => ({ ...tb, blocks: tb.blocks.map((b) => stripHeadingDescs(b, words)) })) };
  return block;
}

async function PatentsTab({ sec }: { sec: PatentSec | null }) {
  // FTO 1차 검토 DB and the KIPRIS views are competitor-facing: all view and 경쟁사 view only.
  const competitorFacing = !sec || sec === 'competitor';
  const [allBlocks, allFto, watch, competitor] = await Promise.all([
    loadBlocks('intel_patents'),
    loadFto(),
    competitorFacing ? loadPatentWatch() : null,
    competitorFacing ? loadCompetitorPatents() : null,
  ]);
  const filtered = filterPatentRows(allBlocks.rows, sec);
  const blocks = {
    ...allBlocks,
    rows:
      sec === 'proposals'
        ? filtered.map((r) => ({ ...r, payload: stripHeadingDescs(r.payload, PROPOSALS_STRIP_WORDS) }))
        : filtered,
  };
  const fto = competitorFacing ? allFto : { ...allFto, rows: [] };
  const lastUpdated =
    [blocks.lastUpdated, fto.lastUpdated, watch?.lastUpdated, competitor?.lastUpdated].filter(Boolean).sort().pop() ?? null;
  if (!blocks.rows.length && !fto.rows.length && !competitorFacing) {
    return (
      <>
        <UpdatedAt iso={lastUpdated} />
        <Empty error={blocks.error ?? fto.error} />
      </>
    );
  }
  if (!competitorFacing) {
    return (
      <>
        <UpdatedAt iso={lastUpdated} />
        <Sections
          rows={blocks.rows}
          sectionLabel="특허 분석"
          stripWords={sec === 'proposals' ? PROPOSALS_STRIP_WORDS : undefined}
        />
      </>
    );
  }
  // Competitor-facing order: KIPRIS trends → KIPRIS new filings → FTO-based portfolio → FTO DB.
  // The all view (no sec) then continues with the remaining sections (당사, 제안).
  const competitorRows = filterPatentRows(blocks.rows, 'competitor');
  const otherRows = blocks.rows.filter((r) => !competitorRows.includes(r));
  return (
    <>
      <UpdatedAt iso={lastUpdated} />
      {competitor && (
        <CompetitorPatentStats stats={aggregateCompetitorStats(competitor.rows)} error={competitor.error} />
      )}
      {watch && <PatentWatchList rows={watch.rows} error={watch.error} max={PATENT_WATCH_MAX} />}
      <Sections rows={competitorRows} sectionLabel="특허 분석" />
      {fto.rows.length > 0 && (
        <div className="space-y-3">
          <div className="mt-8 border-b border-border/70 pb-2">
            <h2 className="font-display text-lg font-bold tracking-tight">FTO 1차 검토 DB</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              FTO 검토 {fto.rows.length}건 기준 · 검토 대상 특허 전건 · 분류·판정·검색 필터
            </p>
          </div>
          <FtoList records={fto.rows} />
        </div>
      )}
      {otherRows.length > 0 && <Sections rows={otherRows} sectionLabel="특허 분석" />}
    </>
  );
}

export default async function IntelPage({ searchParams }: { searchParams: Promise<{ tab?: string; sec?: string }> }) {
  const { tab, sec } = await searchParams;
  const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'news';
  const patentSec = parsePatentSec(sec);
  // Each patent sub-view gets its own visible page title.
  const patentTitle =
    active === 'patents' && patentSec ? PATENT_SEC_TITLES[patentSec] : undefined;

  return (
    <div className="space-y-6">
      {/* Patents sub-pages carry their own specific section headings from data blocks,
          so the generic tab-level heading is visually hidden there (kept for screen readers). */}
      <h1
        className={
          active === 'patents' && !patentTitle
            ? 'sr-only'
            : 'font-display text-2xl font-bold tracking-tight'
        }
      >
        {patentTitle ?? TABS.find((t) => t.key === active)?.label}
      </h1>

      <div className="space-y-4">
        {active === 'news' && <NewsTab />}
        {active === 'competitors' && <CompetitorsTab />}
        {active === 'patents' && <PatentsTab sec={patentSec} />}
      </div>
    </div>
  );
}
