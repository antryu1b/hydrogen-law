'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type {
  CanonicalFamily,
  TreeNode,
  SectionsTreeResponse,
  SectionBlock,
  RecursiveSectionBodyResponse,
} from './types';
import { CODE_TO_FAMILY } from '@/data/kgs-families-display';

interface InlineBodyCompareProps {
  selectedCodes: string[];
}

// --- Tree Node Item (compact for inline sidebar) ---

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  activeSecNo: string | null;
  onSelect: (sec_no: string) => void;
  defaultExpandDepth: number;
}

function TreeNodeItem({
  node,
  depth,
  activeSecNo,
  onSelect,
  defaultExpandDepth,
}: TreeNodeItemProps) {
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);
  const hasChildren = node.children.length > 0;
  const isActive = activeSecNo === node.sec_no;

  useEffect(() => {
    if (activeSecNo && activeSecNo.startsWith(node.sec_no + '.')) {
      setExpanded(true);
    }
  }, [activeSecNo, node.sec_no]);

  return (
    <div>
      <button
        className={[
          'flex items-center gap-0.5 w-full text-left text-[11px] py-0.5 px-0.5 rounded transition-colors',
          isActive
            ? 'bg-[#0d9488]/10 text-[#0d9488] font-semibold'
            : 'hover:bg-muted/50 text-foreground',
        ].join(' ')}
        style={{ paddingLeft: `${depth * 10 + 2}px` }}
        onClick={() => onSelect(node.sec_no)}
      >
        {hasChildren ? (
          <span
            className="flex-shrink-0 w-3 h-3 flex items-center justify-center cursor-pointer hover:text-[#0d9488] text-muted-foreground text-[9px]"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="flex-shrink-0 w-3" />
        )}
        <span className="font-mono text-[#0d9488]/60 text-[9px] flex-shrink-0 mr-0.5">
          {node.sec_no}
        </span>
        <span
          className={[
            'truncate flex-1 leading-tight',
            node.is_umbrella ? 'text-muted-foreground italic' : '',
          ].join(' ')}
          title={node.title}
        >
          {node.title}
        </span>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child._key}
              node={child}
              depth={depth + 1}
              activeSecNo={activeSecNo}
              onSelect={onSelect}
              defaultExpandDepth={defaultExpandDepth}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Recursive Body Column (compact) ---

interface RecursiveBodyColumnProps {
  code: string;
  secNo: string;
  isPresent: boolean;
}

function RecursiveBodyColumn({ code, secNo, isPresent }: RecursiveBodyColumnProps) {
  const [data, setData] = useState<RecursiveSectionBodyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const fetchBody = useCallback(async () => {
    if (!isPresent) return;
    setLoading(true);
    setNotFound(false);
    setData(null);
    try {
      const res = await fetch(
        `/api/kgs/section-body?code=${code}&sec_no=${encodeURIComponent(secNo)}&recursive=true`
      );
      if (res.status === 404) {
        setNotFound(true);
      } else if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [code, secNo, isPresent]);

  useEffect(() => {
    setData(null);
    setNotFound(false);
    fetchBody();
  }, [fetchBody]);

  if (!isPresent) {
    return <p className="text-xs text-muted-foreground italic">해당 섹션 없음</p>;
  }
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="text-xs">불러오는 중...</span>
      </div>
    );
  }
  if (notFound || !data) {
    return <p className="text-xs text-muted-foreground italic">데이터 없음</p>;
  }

  const { blocks } = data;
  if (blocks.length === 0) {
    return <p className="text-xs text-muted-foreground italic">(섹션 없음)</p>;
  }

  return (
    <div className="space-y-2">
      {blocks.map((block: SectionBlock) => (
        <section key={block.sec_no} className="border-l-2 border-muted pl-2">
          <h4 className="text-[11px] font-semibold flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] text-[#0d9488]">{block.sec_no}</span>
            <span className={block.is_umbrella ? 'text-muted-foreground italic' : ''}>
              {block.title}
            </span>
            {block.is_umbrella && (
              <span className="text-[9px] text-muted-foreground italic">(상위 헤더)</span>
            )}
          </h4>
          {block.body ? (
            <pre className="text-[11px] whitespace-pre-wrap mt-0.5 text-foreground/80 font-sans leading-relaxed">
              {block.body}
            </pre>
          ) : !block.is_umbrella ? (
            <p className="text-[11px] text-muted-foreground italic mt-0.5">(본문 없음)</p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/** Detect the dominant family among selected codes (most common family id). */
function detectDominantFamily(codes: string[]): string | null {
  const counts: Record<string, number> = {};
  for (const code of codes) {
    const fid = CODE_TO_FAMILY[code];
    if (fid) counts[fid] = (counts[fid] ?? 0) + 1;
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [fid, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = fid;
      bestCount = count;
    }
  }
  return best;
}

// --- Main InlineBodyCompare Component ---

export function InlineBodyCompare({ selectedCodes }: InlineBodyCompareProps) {
  const [activeSecNo, setActiveSecNo] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<TreeNode[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const prevCodesKey = useRef<string>('');
  const codesKey = selectedCodes.join(',');

  // Fetch tree for primary code whenever selectedCodes changes
  useEffect(() => {
    if (selectedCodes.length === 0) {
      setTreeData(null);
      setActiveSecNo(null);
      return;
    }
    if (codesKey === prevCodesKey.current) return;
    prevCodesKey.current = codesKey;

    const primaryCode = selectedCodes[0];
    setTreeLoading(true);
    setTreeData(null);
    setActiveSecNo(null);

    fetch(`/api/kgs/sections-tree?code=${primaryCode}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: SectionsTreeResponse) => {
        setTreeData(data.tree);
      })
      .catch(() => {
        setTreeData([]);
      })
      .finally(() => setTreeLoading(false));
  }, [codesKey, selectedCodes]);

  // Auto-select first L2 node once tree loads
  useEffect(() => {
    if (!treeData || treeData.length === 0 || activeSecNo) return;
    let firstL2: TreeNode | null = null;
    for (const root of treeData) {
      if (root.children.length > 0) {
        firstL2 = root.children[0];
        break;
      }
      if (root.level === 2) {
        firstL2 = root;
        break;
      }
    }
    if (firstL2) {
      setActiveSecNo(firstL2.sec_no);
    } else if (treeData.length > 0) {
      setActiveSecNo(treeData[0].sec_no);
    }
  }, [treeData, activeSecNo]);

  // For families-based cross-family warning (keep existing logic)
  const [families, setFamilies] = useState<CanonicalFamily[]>([]);
  useEffect(() => {
    if (families.length > 0) return;
    fetch('/api/kgs/canonical-toc')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setFamilies(data.families ?? []))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dominantFamilyId = detectDominantFamily(selectedCodes);
  const crossFamily =
    new Set(selectedCodes.map((c) => CODE_TO_FAMILY[c]).filter(Boolean)).size > 1;

  if (selectedCodes.length === 0) return null;

  const primaryCode = selectedCodes[0];

  return (
    <div className="border rounded-lg overflow-hidden text-sm">
      {/* Family indicator + cross-family warning */}
      <div className="px-3 py-2 bg-muted/40 border-b flex items-center gap-2 flex-wrap">
        {dominantFamilyId && (
          <span className="text-xs font-mono bg-[#0d9488]/10 text-[#0d9488] px-2 py-0.5 rounded-full">
            패밀리 {dominantFamilyId}
          </span>
        )}
        {crossFamily && (
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            다른 family — 본문 의미 다를 수 있음
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          목차: {primaryCode}
        </span>
        {treeLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex" style={{ minHeight: '280px', maxHeight: '480px' }}>
        {/* Left: tree sidebar (1/3) */}
        <aside className="w-1/3 border-r overflow-y-auto bg-muted/10 flex-shrink-0">
          <nav className="p-1">
            {treeData && treeData.length > 0 ? (
              treeData.map((root) => (
                <TreeNodeItem
                  key={root._key}
                  node={root}
                  depth={0}
                  activeSecNo={activeSecNo}
                  onSelect={setActiveSecNo}
                  defaultExpandDepth={2}
                />
              ))
            ) : !treeLoading ? (
              <p className="text-xs text-muted-foreground p-3">목차 없음</p>
            ) : null}
          </nav>
        </aside>

        {/* Right: body columns (2/3) */}
        <div className="flex-1 overflow-auto">
          {activeSecNo ? (
            <div className="h-full flex flex-col">
              {/* Section header */}
              <div className="border-b px-3 py-2 bg-background sticky top-0 z-10">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[#0d9488] font-bold text-xs">
                    {activeSecNo}
                  </span>
                  <span className="text-xs text-muted-foreground">({selectedCodes.length}개 코드)</span>
                </div>
              </div>

              {/* Code columns */}
              <div
                className="flex-1 grid divide-x overflow-auto"
                style={{
                  gridTemplateColumns: `repeat(${selectedCodes.length}, minmax(0, 1fr))`,
                }}
              >
                {selectedCodes.map((code) => {
                  const familyId = CODE_TO_FAMILY[code];
                  return (
                    <article key={code} className="p-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-mono font-bold text-[#0d9488] text-xs">{code}</h3>
                        {familyId && (
                          <span className="text-[9px] bg-[#0d9488]/10 text-[#0d9488] px-1 py-0.5 rounded-full">
                            {familyId}
                          </span>
                        )}
                      </div>
                      <RecursiveBodyColumn
                        code={code}
                        secNo={activeSecNo}
                        isPresent={true}
                      />
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">
              좌측에서 섹션을 선택하세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
