import type { Metadata } from 'next';
import { IntelBlockList } from '@/components/intel/IntelBlocks';
import { CompetitorSiteWatch } from '@/components/intel/CompetitorSiteWatch';
import { FtoList } from '@/components/intel/FtoList';
import { NewsList } from '@/components/intel/NewsList';
import { CompetitorPatentStats } from '@/components/intel/PatentWatch';
import { PatentWatchList } from '@/components/intel/PatentWatchList';
import { filterPatentRows, parsePatentSec, stripSectionWords, type PatentSec } from '@/lib/intel-utils';
import {
  formatKst,
  loadBlocks,
  loadCompetitorPatents,
  loadCompetitorWatch,
  loadFto,
  loadNews,
  loadPatentChecks,
  loadPatentStatus,
  loadPatentWatch,
  PATENT_WATCH_MAX,
  type BlockRow,
  type IntelBlock,
} from '@/lib/intel';
import { aggregateCompetitorStats, normalizeAppNo } from '@/lib/patent-watch';

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

// One line under each page title: how the data is refreshed first, then when it last was.
// Cadence text must match what actually runs (vercel.json crons; Hobby fires once a day within the hour).
const CADENCE = {
  news: '매일 1회 갱신(Google News)',
  competitorSites: '매일 1회 갱신(공식 홈페이지)',
  kipris: '매일 1회 갱신(KIPRIS 한국·미국·유럽 신규 출원 · 국내 FTO 권리상태 순차 조회)',
  report: '보고서 기준',
} as const;

function UpdatedAt({
  cadence,
  iso,
  label = '마지막 갱신',
  value,
  note,
}: {
  cadence: string;
  iso?: string | null;
  label?: string;
  /** Pre-formatted value; otherwise `iso` in KST. */
  value?: string;
  note?: string;
}) {
  return (
    <p className="text-xs text-muted-foreground">
      {cadence} · {label}{' '}
      <span className="font-medium tabular-nums text-foreground">{value ?? formatKst(iso ?? null)}</span>
      {note ? ` · ${note}` : ''}
    </p>
  );
}

/** Marks seeded report blocks that never auto-update (render-level only; payloads untouched). */
function ReportBasisNote({ children }: { children: string }) {
  return <p className="mt-6 text-xs text-muted-foreground">{children}</p>;
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
      <UpdatedAt cadence={CADENCE.news} label="최신 기사 발행일" value={latestPublished ?? '—'} />
      {rows.length ? <NewsList rows={rows} /> : <Empty error={error} />}
    </>
  );
}

async function CompetitorsTab() {
  const [{ rows, lastUpdated, error }, watch] = await Promise.all([
    loadBlocks('intel_competitors'),
    loadCompetitorWatch(),
  ]);
  return (
    <>
      <UpdatedAt
        cadence={CADENCE.competitorSites}
        iso={watch.lastUpdated}
        note={`비교표는 ${CADENCE.report}(${formatKst(lastUpdated)})`}
      />
      {rows.length ? (
        <Sections rows={rows} sectionLabel="경쟁사 비교" stripWords={['경쟁사', '비교']} />
      ) : (
        <Empty error={error} />
      )}
      <CompetitorSiteWatch rows={watch.rows} error={watch.error} nowMs={Date.now()} />
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
  const [allBlocks, allFto, watch, competitor, autoStatus, checks] = await Promise.all([
    loadBlocks('intel_patents'),
    loadFto(),
    competitorFacing ? loadPatentWatch() : null,
    competitorFacing ? loadCompetitorPatents() : null,
    competitorFacing ? loadPatentStatus() : null,
    competitorFacing ? loadPatentChecks() : null,
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
  // Last KIPRIS cron run (cursor row), even when it inserted nothing new.
  const lastCollected =
    Object.values(checks ?? {})
      .map((c) => c?.at)
      .filter((at): at is string => !!at)
      .sort()
      .pop() ?? null;
  if (!blocks.rows.length && !fto.rows.length && !competitorFacing) {
    return (
      <>
        <UpdatedAt cadence={CADENCE.report} iso={lastUpdated} />
        <Empty error={blocks.error ?? fto.error} />
      </>
    );
  }
  if (!competitorFacing) {
    return (
      <>
        <UpdatedAt cadence={CADENCE.report} iso={lastUpdated} />
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
      <UpdatedAt cadence={CADENCE.kipris} iso={[lastCollected, lastUpdated].filter(Boolean).sort().pop() ?? null} />
      {competitor && (
        <CompetitorPatentStats stats={aggregateCompetitorStats(competitor.rows)} error={competitor.error} />
      )}
      {watch && <PatentWatchList rows={watch.rows} error={watch.error} max={PATENT_WATCH_MAX} checks={checks} />}
      {competitorRows.length > 0 && (
        <ReportBasisNote>
          아래 분석·참고 문구는 보고서 기준(작성 시점)이며 자동 갱신되지 않습니다 · 권리상태 최신값은 FTO 1차 검토 DB의 자동
          조회 값을 확인하세요.
        </ReportBasisNote>
      )}
      <Sections rows={competitorRows} sectionLabel="특허 분석" />
      {fto.rows.length > 0 && (
        <div className="space-y-3">
          <div className="mt-8 border-b border-border/70 pb-2">
            <h2 className="font-display text-lg font-bold tracking-tight">FTO 1차 검토 DB</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              FTO 검토 {fto.rows.length}건 기준 · 검토 대상 특허 전건 · 분류·판정·검색 필터
            </p>
          </div>
          <FtoList
            records={fto.rows}
            autoStatus={Object.fromEntries(
              (autoStatus?.rows ?? []).map((s) => [
                normalizeAppNo(s.appNo),
                { registerStatus: s.registerStatus, checkedAt: s.checkedAt },
              ]),
            )}
          />
        </div>
      )}
      {otherRows.length > 0 && (
        <>
          <ReportBasisNote>아래 내용은 보고서 기준(작성 시점)이며 자동 갱신되지 않습니다.</ReportBasisNote>
          <Sections rows={otherRows} sectionLabel="특허 분석" />
        </>
      )}
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
