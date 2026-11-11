'use client';

import { useMemo, useState } from 'react';
import type { FtoRecord } from '@/lib/intel';
import { PATENT_CATEGORY_LABEL, normalizeAppNo } from '@/lib/patent-watch';
import { resolveFtoCat } from '@/lib/patent-db';

const CATEGORY_LABEL: Record<string, string> = PATENT_CATEGORY_LABEL;
const MAX_RENDER = 300;

function safeHref(url?: string) {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/** checkedAt (ISO) → 'YYYY-MM-DD' in KST. */
function kstDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

/** Machine-collected KIPRIS status, visually apart from the reviewed fields (dashed, labelled). */
function AutoStatusNote({ status }: { status?: { registerStatus: string; checkedAt: string } }) {
  if (!status) return null;
  return (
    <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-1.5 rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">현재 상태 {status.registerStatus}</span>
      <span>· 자동 수집 · KIPRIS · 반영일 {kstDate(status.checkedAt)}</span>
    </p>
  );
}

// Searchable FTO review list (400 records from the legacy PATENTS constant).
// `autoStatus` (appNo digits → KIPRIS status) is machine-collected and shown apart from the reviewed fields.
export function FtoList({
  records,
  autoStatus = {},
}: {
  records: FtoRecord[];
  autoStatus?: Record<string, { registerStatus: string; checkedAt: string }>;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [verdict, setVerdict] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return records.filter((p) => {
      if (cat && resolveFtoCat(p.category) !== cat) return false;
      if (verdict === 'need' && p.verdict !== '상세검토 필요') return false;
      if (verdict === 'noneed' && p.verdict !== '상세검토 불필요') return false;
      if (!needle) return true;
      return [p.title, p.appNo, p.applicant, p.reason].some((v) => (v ?? '').toLowerCase().includes(needle));
    });
  }, [records, q, cat, verdict]);

  const control =
    'h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="명칭·출원번호·출원인·사유 검색"
          className={`${control} min-w-[14rem] flex-1`}
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={control} aria-label="분류">
          <option value="">전체 분류</option>
          {Object.entries(CATEGORY_LABEL)
            .filter(([k]) => k !== 'transfer') // 이관 is folded into 시스템 at render level
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        <select value={verdict} onChange={(e) => setVerdict(e.target.value)} className={control} aria-label="판정">
          <option value="">전체 판정</option>
          <option value="need">상세검토 필요</option>
          <option value="noneed">상세검토 불필요</option>
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length}건 표시 중 (전체 {records.length}건
          {filtered.length > MAX_RENDER ? ` · 상위 ${MAX_RENDER}건만 표시` : ''})
        </span>
      </div>
      <div className="space-y-2">
        {filtered.slice(0, MAX_RENDER).map((p) => (
          <div key={p.no} className="rounded-lg border border-border/80 bg-card p-3.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {CATEGORY_LABEL[resolveFtoCat(p.category)] ?? p.category ?? '-'}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                  p.verdict === '상세검토 필요'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {p.verdict ?? '-'}
              </span>
              <strong className="font-semibold">{p.title}</strong>
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">
              출원번호 {p.appNo ?? '-'} · 출원인 {(p.applicant ?? '-').split('|')[0].trim()} · 상태 {p.status ?? '-'}
              {p.filedDate ? ` · 출원일 ${p.filedDate}` : ''}
            </div>
            <AutoStatusNote status={autoStatus[normalizeAppNo(p.appNo)]} />
            {p.reason && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{p.reason}</p>}
            {safeHref(p.link) && (
              <a
                href={safeHref(p.link)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-block text-xs text-[hsl(var(--brass))] hover:underline"
              >
                WIPS 원문 보기 →
              </a>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            검색 결과가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
