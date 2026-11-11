import type { Metadata } from 'next';
import Link from 'next/link';
import { IntelBlockList } from '@/components/intel/IntelBlocks';
import { CompetitorSiteWatch } from '@/components/intel/CompetitorSiteWatch';
import { NewsList } from '@/components/intel/NewsList';
import { CompetitorPatentStats } from '@/components/intel/PatentWatch';
import { PatentDbList } from '@/components/intel/PatentDb';
import { applyFtoStageCleanup, filterPatentRows, parsePatentSec, stripSectionWords, type PatentSec } from '@/lib/intel-utils';
import { computePortfolioCounts, parseDbParams, type PortfolioGroupCount } from '@/lib/patent-db';
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
  db: '특허 종합 DB',
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

/**
 * 경쟁사 포트폴리오 — groups rendered as prominent cards with company counts.
 * Counts are computed via computePortfolioCounts (same buildDbRows + filterPatentDb
 * path as the DB list), so the card count equals the row count the linked DB view shows.
 */
function CompetitorPortfolioSection({
  counts,
  watchCapped,
}: {
  counts: PortfolioGroupCount[];
  watchCapped: boolean;
}) {
  return (
    <div>
      <div className="mt-10 border-b border-border/70 pb-2">
        <h2 className="font-display text-lg font-bold tracking-tight">경쟁사 포트폴리오</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          그룹별 경쟁사 현황 · 각 사명 클릭 시 특허 종합 DB에서 필터 적용
          {watchCapped && ` · KIPRIS 감시 목록은 최신 ${PATENT_WATCH_MAX}건까지만 반영`}
        </p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {counts.map((g) => (
          <div key={g.label} className="rounded-lg border border-border bg-card p-4">
            <Link
              href={`/intel?tab=patents&sec=db&group=${encodeURIComponent(g.label)}`}
              className="block font-semibold hover:text-[hsl(var(--brass))] transition-colors"
            >
              {g.label}
            </Link>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{g.total}건</p>
            <ul className="mt-3 space-y-1.5">
              {g.companies
                .filter((c) => c.total > 0)
                .map((c) => (
                  <li key={c.label}>
                    <Link
                      href={`/intel?tab=patents&sec=db&group=${encodeURIComponent(g.label)}&company=${encodeURIComponent(c.label)}`}
                      className="flex items-center justify-between gap-2 text-sm hover:text-[hsl(var(--brass))] transition-colors"
                    >
                      <span>{c.label}</span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{c.total}건</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm">
        <Link
          href="/intel?tab=patents&sec=db"
          className="text-[hsl(var(--brass))] hover:underline"
        >
          전체 특허 목록은 특허 종합 DB에서 →
        </Link>
      </p>
    </div>
  );
}

async function PatentsDbView({
  initialGroup,
  initialCompany,
  initialQ,
  initialCat,
  initialVerdict,
  initialCountry,
  initialRights,
}: {
  initialGroup: string;
  initialCompany: string;
  initialQ: string;
  initialCat: string;
  initialVerdict: string;
  initialCountry: string;
  initialRights: string;
}) {
  const [allFto, watch, autoStatus, checks] = await Promise.all([
    loadFto(),
    loadPatentWatch(),
    loadPatentStatus(),
    loadPatentChecks(),
  ]);
  const lastCollected =
    Object.values(checks ?? {})
      .map((c) => c?.at)
      .filter((at): at is string => !!at)
      .sort()
      .pop() ?? null;
  const lastUpdated = [allFto.lastUpdated, watch.lastUpdated, lastCollected].filter(Boolean).sort().pop() ?? null;
  // key resets client filter state on soft navigation (URL param change).
  const listKey = [initialGroup, initialCompany, initialQ, initialCat, initialVerdict, initialCountry, initialRights].join('|');
  return (
    <>
      <UpdatedAt cadence={CADENCE.kipris} iso={lastUpdated} />
      <PatentDbList
        key={listKey}
        ftoRecords={allFto.rows}
        autoStatus={Object.fromEntries(
          (autoStatus?.rows ?? []).map((s) => [
            normalizeAppNo(s.appNo),
            { registerStatus: s.registerStatus, checkedAt: s.checkedAt },
          ]),
        )}
        watchRows={watch.rows}
        checks={checks}
        max={PATENT_WATCH_MAX}
        initialGroup={initialGroup}
        initialCompany={initialCompany}
        initialQ={initialQ}
        initialCat={initialCat}
        initialVerdict={initialVerdict}
        initialCountry={initialCountry}
        initialRights={initialRights}
      />
    </>
  );
}

async function PatentsTab({ sec }: { sec: PatentSec | null }) {
  // 특허 종합 DB is handled separately — it has its own data sources.
  // (sec value handled by caller; sec=db arrives via PatentsDbView)
  const competitorFacing = !sec || sec === 'competitor';
  const [allBlocks, competitor, ftoForCount, watchForCount] = await Promise.all([
    loadBlocks('intel_patents'),
    competitorFacing ? loadCompetitorPatents() : null,
    // Load FTO + watch so portfolio card counts match the DB list (same data path).
    competitorFacing ? loadFto() : null,
    competitorFacing ? loadPatentWatch() : null,
  ]);
  const filtered = filterPatentRows(allBlocks.rows, sec);
  const blocks = {
    ...allBlocks,
    rows:
      sec === 'proposals'
        ? filtered.map((r) => ({ ...r, payload: stripHeadingDescs(r.payload, PROPOSALS_STRIP_WORDS) }))
        : filtered,
  };
  const lastUpdated = [blocks.lastUpdated, competitor?.lastUpdated].filter(Boolean).sort().pop() ?? null;

  if (!blocks.rows.length && !competitorFacing) {
    return (
      <>
        <UpdatedAt cadence={CADENCE.report} iso={lastUpdated} />
        <Empty error={blocks.error} />
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
  // Competitor-facing (all view or sec=competitor):
  //   - KIPRIS trends (CompetitorPatentStats)
  //   - 경쟁사 포트폴리오 section (prominent group tabs linking to 특허 종합 DB)
  //   - Report blocks (Supabase intel_patents section=competitor)
  //   - Remaining blocks (all view only)
  // applyFtoStageCleanup removes 1차/2차 review-stage descriptor blocks at render time.
  const rawCompetitorRows = filterPatentRows(blocks.rows, 'competitor');
  const competitorRows = applyFtoStageCleanup(rawCompetitorRows);
  const otherRows = applyFtoStageCleanup(blocks.rows.filter((r) => !rawCompetitorRows.includes(r)));
  const stats = competitor ? aggregateCompetitorStats(competitor.rows) : null;

  // Portfolio counts via same buildDbRows + filterPatentDb path as the DB list.
  const portfolioCounts =
    ftoForCount && watchForCount
      ? computePortfolioCounts(ftoForCount.rows, watchForCount.rows)
      : null;
  const watchCapped = watchForCount ? watchForCount.rows.length >= PATENT_WATCH_MAX : false;

  return (
    <>
      <UpdatedAt cadence={CADENCE.kipris} iso={lastUpdated} />
      {competitor?.error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p className="font-semibold text-destructive">경쟁사 통계 로드 실패</p>
          <p className="mt-1 text-muted-foreground">{competitor.error}</p>
        </div>
      )}
      {stats && (
        <CompetitorPatentStats stats={stats} error={competitor?.error ?? null} />
      )}
      {portfolioCounts && <CompetitorPortfolioSection counts={portfolioCounts} watchCapped={watchCapped} />}
      {competitorRows.length > 0 && (
        <ReportBasisNote>
          아래 분석·참고 문구는 보고서 기준(작성 시점)이며 자동 갱신되지 않습니다 · 권리상태 최신값은 특허 종합 DB에서 확인하세요.
        </ReportBasisNote>
      )}
      <Sections rows={competitorRows} sectionLabel="특허 분석" />
      {otherRows.length > 0 && (
        <>
          <ReportBasisNote>아래 내용은 보고서 기준(작성 시점)이며 자동 갱신되지 않습니다.</ReportBasisNote>
          <Sections rows={otherRows} sectionLabel="특허 분석" />
        </>
      )}
    </>
  );
}

export default async function IntelPage({
  searchParams,
}: {
  // Next.js 15: a repeated query param (e.g. ?q=a&q=b) is delivered as string[].
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  // tab and sec are always single values; take first if array
  const rawFirst = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));
  const tab = rawFirst(rawParams['tab']);
  const sec = rawFirst(rawParams['sec']);

  const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'news';
  const patentSec = parsePatentSec(sec);

  // Parse and validate DB-specific params (guards against repeated params and unknown values).
  const { group, company, q, cat, verdict, country, rights } = parseDbParams(rawParams);

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
        {active === 'patents' && patentSec === 'db' && (
          <PatentsDbView
            initialGroup={group}
            initialCompany={company}
            initialQ={q}
            initialCat={cat}
            initialVerdict={verdict}
            initialCountry={country}
            initialRights={rights}
          />
        )}
        {active === 'patents' && patentSec !== 'db' && <PatentsTab sec={patentSec} />}
      </div>
    </div>
  );
}
