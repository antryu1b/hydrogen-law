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
          className="grid divide-x border-t"
          style={{ gridTemplateColumns: `repeat(${selectedCodes.length}, minmax(0, 1fr))` }}
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

  // Compute intersection: sec_nos present in ALL selected codes
  const intersectionItems: IntersectionItem[] = [];
  const uniqueItems: UniqueItem[] = [];

  for (const [secNo, entry] of secNoMap) {
    const presentCodes = selectedCodes.filter((c) => entry.codes[c]?.present);
    const codesWithBody = presentCodes.filter((c) => (entry.codes[c]?.body_chars ?? 0) > 0);

    if (presentCodes.length === selectedCodes.length) {
      // Present in all codes = intersection
      intersectionItems.push({
        sec_no: secNo,
        title: entry.title,
        level: entry.level,
        codesWithBody,
        codesPresent: presentCodes,
        isUmbrella: codesWithBody.length === 0,
      });
    } else if (presentCodes.length === 1) {
      // Present in only one code = unique to that code
      uniqueItems.push({
        code: presentCodes[0],
        sec_no: secNo,
        title: entry.title,
      });
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
