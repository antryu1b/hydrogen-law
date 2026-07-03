'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { CanonicalFamily, CanonicalTocEntry, SectionBody } from './types';
import { CODE_TO_FAMILY } from '@/data/kgs-families-display';

interface ViewBProps {
  selectedCodes: string[];
  families: CanonicalFamily[];
}

interface IntersectionItem {
  sec_no: string;
  title: string;
  level: number;
  codesWithBody: string[]; // codes that have body_chars > 0
  codesPresent: string[]; // codes that have present=true
  isUmbrella: boolean;
}

interface UniqueItem {
  code: string;
  sec_no: string;
  title: string;
}

// Sections that share the same title across codes but sit at different sec_no.
// byCode maps each present code to its own sec_no (numbers may differ per code).
interface TitleAlignedItem {
  title: string;
  level: number;
  byCode: Record<string, string>; // code -> that code's sec_no
  codesWithBody: string[];
}

// Collapse whitespace so "일반 사항" and "일반사항" match; used as title key.
const normTitle = (t: string) => t.replace(/\s+/g, '');

function BodyCell({ code, secNo }: { code: string; secNo: string }) {
  const [data, setData] = useState<SectionBody | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`/api/kgs/section-body?code=${code}&sec_no=${encodeURIComponent(secNo)}`);
      if (res.status === 404) {
        setNotFound(true);
      } else if (res.ok) {
        setData(await res.json());
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [code, secNo]);

  useEffect(() => {
    setData(null);
    setNotFound(false);
    fetch_();
  }, [fetch_]);

  if (loading) return <div className="flex items-center gap-1 text-muted-foreground text-xs"><Loader2 className="w-3 h-3 animate-spin" />불러오는 중</div>;
  if (notFound || !data) return <p className="text-xs text-muted-foreground italic">데이터 없음</p>;
  if (data.is_umbrella || data.body_chars === 0) return <p className="text-xs text-muted-foreground italic">(상위 헤더)</p>;
  return <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{data.body}</pre>;
}

function IntersectionRow({
  item,
  selectedCodes,
  defaultOpen,
}: {
  item: IntersectionItem;
  selectedCodes: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="border rounded-lg mb-2 overflow-hidden"
    >
      <summary className="px-4 py-3 hover:bg-muted cursor-pointer flex items-center gap-2 list-none select-none">
        <span className="text-muted-foreground flex-shrink-0">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="font-mono text-primary text-sm flex-shrink-0">{item.sec_no}</span>
        <span className="font-medium text-sm flex-1 min-w-0 truncate">{item.title}</span>
        <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto">
          {item.codesWithBody.length}/{selectedCodes.length} 본문 있음
        </span>
        {item.isUmbrella && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground flex-shrink-0">헤더</span>
        )}
      </summary>
      {open && (
        <div
          className="grid grid-cols-1 divide-y lg:divide-y-0 lg:divide-x border-t lg:[grid-template-columns:var(--cols)]"
          style={
            {
              '--cols': `repeat(${selectedCodes.length}, minmax(0, 1fr))`,
            } as React.CSSProperties
          }
        >
          {selectedCodes.map((code) => {
            const isPresent = item.codesPresent.includes(code);
            const familyId = CODE_TO_FAMILY[code];
            return (
              <div key={code} className="p-4">
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className="font-mono font-bold text-primary text-sm">{code}</span>
                  {familyId && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                      {familyId}
                    </span>
                  )}
                </div>
                {isPresent ? (
                  <BodyCell code={code} secNo={item.sec_no} />
                ) : (
                  <p className="text-sm text-muted-foreground italic">이 코드엔 해당 섹션 없음</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </details>
  );
}

function TitleAlignedRow({
  item,
  selectedCodes,
  defaultOpen,
}: {
  item: TitleAlignedItem;
  selectedCodes: string[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const secNos = Array.from(new Set(Object.values(item.byCode)));

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="border rounded-lg mb-2 overflow-hidden border-amber-200 dark:border-amber-800"
    >
      <summary className="px-4 py-3 hover:bg-muted cursor-pointer flex items-center gap-2 list-none select-none">
        <span className="text-muted-foreground flex-shrink-0">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
        <span className="font-mono text-amber-700 dark:text-amber-400 text-sm flex-shrink-0">
          {secNos.join(' / ')}
        </span>
        <span className="font-medium text-sm flex-1 min-w-0 truncate">{item.title}</span>
        <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded flex-shrink-0">
          번호 상이
        </span>
        <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto">
          {item.codesWithBody.length}/{selectedCodes.length} 본문 있음
        </span>
      </summary>
      {open && (
        <div
          className="grid grid-cols-1 divide-y lg:divide-y-0 lg:divide-x border-t lg:[grid-template-columns:var(--cols)]"
          style={
            {
              '--cols': `repeat(${selectedCodes.length}, minmax(0, 1fr))`,
            } as React.CSSProperties
          }
        >
          {selectedCodes.map((code) => {
            const secNo = item.byCode[code];
            const familyId = CODE_TO_FAMILY[code];
            return (
              <div key={code} className="p-4">
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className="font-mono font-bold text-primary text-sm">{code}</span>
                  {secNo && (
                    <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
                      {secNo}
                    </span>
                  )}
                  {familyId && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                      {familyId}
                    </span>
                  )}
                </div>
                {secNo ? (
                  <BodyCell code={code} secNo={secNo} />
                ) : (
                  <p className="text-sm text-muted-foreground italic">이 코드엔 해당 섹션 없음</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </details>
  );
}

export function ViewB({ selectedCodes, families }: ViewBProps) {
  if (selectedCodes.length < 2) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        코드를 2개 이상 선택하세요.
      </p>
    );
  }

  // Build sec_no → entry map from all families
  const secNoMap = new Map<string, CanonicalTocEntry>();
  for (const family of families) {
    for (const entry of family.canonical_toc) {
      if (!secNoMap.has(entry.sec_no)) {
        secNoMap.set(entry.sec_no, entry);
      }
    }
  }

  // Count how often each title occurs *within* a single code. A title that
  // recurs (e.g. generic "일반사항") is ambiguous and must NOT be title-aligned.
  const titleCountByCode: Record<string, Record<string, number>> = {};
  for (const code of selectedCodes) titleCountByCode[code] = {};
  for (const [, entry] of secNoMap) {
    const key = normTitle(entry.title);
    for (const code of selectedCodes) {
      if (entry.codes[code]?.present) {
        titleCountByCode[code][key] = (titleCountByCode[code][key] ?? 0) + 1;
      }
    }
  }

  // First pass: full intersection (present in all codes at the same sec_no)
  // vs. partials (present in some, but not all, codes).
  const intersectionItems: IntersectionItem[] = [];
  interface Partial {
    sec_no: string;
    title: string;
    level: number;
    presentCodes: string[];
    codesWithBody: string[];
  }
  const partials: Partial[] = [];

  for (const [secNo, entry] of secNoMap) {
    const presentCodes = selectedCodes.filter((c) => entry.codes[c]?.present);
    if (presentCodes.length === 0) continue;
    const codesWithBody = presentCodes.filter((c) => (entry.codes[c]?.body_chars ?? 0) > 0);

    if (presentCodes.length === selectedCodes.length) {
      intersectionItems.push({
        sec_no: secNo,
        title: entry.title,
        level: entry.level,
        codesWithBody,
        codesPresent: presentCodes,
        isUmbrella: codesWithBody.length === 0,
      });
    } else {
      partials.push({ sec_no: secNo, title: entry.title, level: entry.level, presentCodes, codesWithBody });
    }
  }

  // Second pass: align partials by title across codes. Guarded so only safe
  // matches merge — same level, and the title occurs exactly once in each
  // participating code (unambiguous). Everything else falls through to unique.
  const partialsByTitle = new Map<string, Partial[]>();
  for (const p of partials) {
    const key = normTitle(p.title);
    const bucket = partialsByTitle.get(key);
    if (bucket) bucket.push(p);
    else partialsByTitle.set(key, [p]);
  }

  const titleAlignedItems: TitleAlignedItem[] = [];
  const leftover: Partial[] = [];

  for (const [key, group] of partialsByTitle) {
    const byCode: Record<string, string> = {};
    const codesWithBody = new Set<string>();
    const level = group[0].level;
    let ok = true;

    for (const p of group) {
      if (p.level !== level) ok = false;
      for (const code of p.presentCodes) {
        if (titleCountByCode[code][key] !== 1) ok = false; // ambiguous within code
        if (byCode[code] && byCode[code] !== p.sec_no) ok = false; // conflicting sec_no
        byCode[code] = p.sec_no;
        if (p.codesWithBody.includes(code)) codesWithBody.add(code);
      }
    }

    // Only align when it actually spans ≥2 codes and every guard held.
    if (ok && Object.keys(byCode).length >= 2) {
      titleAlignedItems.push({
        title: group[0].title,
        level,
        byCode,
        codesWithBody: Array.from(codesWithBody),
      });
    } else {
      leftover.push(...group);
    }
  }

  // Remaining single-code partials are genuinely unique to that code.
  const uniqueItems: UniqueItem[] = [];
  for (const p of leftover) {
    if (p.presentCodes.length === 1) {
      uniqueItems.push({ code: p.presentCodes[0], sec_no: p.sec_no, title: p.title });
    }
  }

  // Group unique items by code
  const uniqueByCode: Record<string, UniqueItem[]> = {};
  for (const item of uniqueItems) {
    if (!uniqueByCode[item.code]) uniqueByCode[item.code] = [];
    uniqueByCode[item.code].push(item);
  }

  return (
    <div className="space-y-6">
      {/* Unique sections banner */}
      {uniqueItems.length > 0 && (
        <div className="border rounded-lg p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <h3 className="text-sm font-semibold mb-2 text-amber-800 dark:text-amber-300">
            특정 코드에만 있는 섹션
          </h3>
          <div className="space-y-2">
            {Object.entries(uniqueByCode).map(([code, items]) => (
              <div key={code}>
                <span className="font-mono text-xs font-bold text-primary">{code}</span>
                <span className="text-xs text-muted-foreground ml-2">에만 있음 ({items.length}개):</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {items.map((item) => (
                    <span
                      key={item.sec_no}
                      className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono"
                    >
                      {item.sec_no} {item.title.slice(0, 20)}{item.title.length > 20 ? '…' : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Title-aligned sections: same title, different sec_no across codes */}
      {titleAlignedItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3 text-amber-700 dark:text-amber-400">
            제목은 같지만 번호가 다른 섹션 ({titleAlignedItems.length}개)
          </h3>
          {titleAlignedItems.map((item, idx) => (
            <TitleAlignedRow
              key={`${normTitle(item.title)}-${idx}`}
              item={item}
              selectedCodes={selectedCodes}
              defaultOpen={false}
            />
          ))}
        </div>
      )}

      {/* Intersection sections */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
          공통 섹션 ({intersectionItems.length}개)
        </h3>
        {intersectionItems.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center border rounded-lg">
            공통 섹션이 없습니다. 다른 코드를 선택해보세요.
          </p>
        ) : (
          intersectionItems.map((item, idx) => (
            <IntersectionRow
              key={item.sec_no}
              item={item}
              selectedCodes={selectedCodes}
              defaultOpen={idx === 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
