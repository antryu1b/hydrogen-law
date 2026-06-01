'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  CanonicalFamily,
  TreeNode,
  SectionsTreeResponse,
  SectionBlock,
  RecursiveSectionBodyResponse,
} from './types';
import { CODE_TO_FAMILY } from '@/data/kgs-families-display';
import { EquationImages, PageViewButton } from './EquationImages';

interface ViewAProps {
  selectedCodes: string[];
  families: CanonicalFamily[];
  activeFamilyId: string | null;
}

// --- Tree Node Component ---

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
  // Appendix group root: collapsed by default (secondary content)
  const defaultExpanded = node._appendix_group ? false : depth < defaultExpandDepth;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;
  const isActive = activeSecNo === node.sec_no;
  const isAppendixGroup = node._appendix_group === true;

  // When a descendant becomes active, ensure this node is expanded
  useEffect(() => {
    if (activeSecNo && activeSecNo.startsWith(node.sec_no + '.')) {
      setExpanded(true);
    }
  }, [activeSecNo, node.sec_no]);

  // Synthetic appendix group root — special rendering
  if (isAppendixGroup) {
    return (
      <div className="mt-1 border-t border-muted/40 pt-1">
        <button
          className="flex items-center gap-1 w-full text-left text-xs py-1 px-1 rounded transition-colors hover:bg-muted/30 text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center text-[10px]">
            {expanded ? '▼' : '▶'}
          </span>
          <span className="text-[11px] mr-0.5">📎</span>
          <span className="truncate flex-1 text-muted-foreground">
            {node.title}
          </span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child) => (
              <TreeNodeItem
                key={child._key}
                node={child}
                depth={1}
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

  return (
    <div>
      <button
        className={[
          'flex items-center gap-1 w-full text-left text-xs py-1 px-1 rounded transition-colors',
          isActive ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50 text-foreground',
        ].join(' ')}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelect(node.sec_no)}
      >
        {hasChildren ? (
          <span
            className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center cursor-pointer hover:text-primary text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="flex-shrink-0 w-3.5" />
        )}
        <span className="font-mono text-primary/70 text-[10px] flex-shrink-0 mr-0.5">
          {node.sec_no}
        </span>
        <span
          className={[
            'truncate flex-1',
            node.is_umbrella ? 'text-muted-foreground italic' : '',
            node.is_appendix ? 'text-muted-foreground' : '',
          ].join(' ')}
          title={node.title}
        >
          {node.title}
        </span>
        {node.is_umbrella && (
          <span className="flex-shrink-0 text-[9px] text-muted-foreground ml-1">↳</span>
        )}
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

// --- Recursive Body Column (per code) ---

interface RecursiveBodyColumnProps {
  code: string;
  secNo: string;
  /** True if this sec_no is known to exist in the code's tree */
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
    return <p className="text-sm text-muted-foreground italic">이 코드엔 해당 섹션 없음</p>;
  }
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-sm">불러오는 중...</span>
      </div>
    );
  }
  if (notFound || !data) {
    return <p className="text-sm text-muted-foreground italic">섹션 데이터 없음</p>;
  }

  const { blocks } = data;

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground italic">(섹션 없음)</p>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block: SectionBlock) => (
        <section key={block.sec_no} className="border-l-2 border-muted pl-3">
          <h4 className="text-sm font-semibold flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-primary">{block.sec_no}</span>
            <span className={block.is_umbrella ? 'text-muted-foreground italic' : ''}>
              {block.title}
            </span>
            {block.is_umbrella && (
              <span className="text-[10px] text-muted-foreground italic">(상위 헤더)</span>
            )}
          </h4>
          {block.body ? (
            <pre className="text-sm lg:text-xs whitespace-pre-wrap break-words mt-1 text-foreground/80 font-sans leading-relaxed">
              {block.body}
            </pre>
          ) : !block.is_umbrella ? (
            <p className="text-xs text-muted-foreground italic mt-1">(본문 없음)</p>
          ) : null}
          {block.equation_regions && block.equation_regions.length > 0 && (
            <EquationImages code={code} equationRegions={block.equation_regions} />
          )}
          <PageViewButton
            code={code}
            pageStart={block.page_start ?? 0}
            pageEnd={block.page_end ?? 0}
          />
        </section>
      ))}
    </div>
  );
}

// --- Main ViewA Component ---

export function ViewA({ selectedCodes, families, activeFamilyId }: ViewAProps) {
  const [activeSecNo, setActiveSecNo] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<TreeNode[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const prevCodesKey = useRef<string>('');
  const codesKey = selectedCodes.join(',');

  // Fetch tree for the first selected code whenever selectedCodes changes
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

  // Auto-select first L2 node when tree loads (skip synthetic __appendix__ group)
  useEffect(() => {
    if (!treeData || treeData.length === 0 || activeSecNo) return;
    // Find first L2 node (child of a non-appendix root node)
    let firstL2: TreeNode | null = null;
    for (const root of treeData) {
      if (root._appendix_group) continue;
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
    } else {
      // Fallback to first non-appendix-group root
      const firstReal = treeData.find((r) => !r._appendix_group);
      if (firstReal) setActiveSecNo(firstReal.sec_no);
    }
  }, [treeData, activeSecNo]);

  // Determine if a given sec_no is "present" in a code.
  // We use the tree as the source of truth for the primary code.
  // For other codes, we fall back to always attempting a fetch (the API returns 404 if absent).
  const primaryCode = selectedCodes[0];

  // Build a flat set of sec_nos from the tree for the primary code
  // Skip the synthetic __appendix__ group root (it has no fetchable body)
  const primarySecNos = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!treeData) return;
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (!n._appendix_group) {
          primarySecNos.current.add(n.sec_no);
        }
        if (n.children.length > 0) collect(n.children);
      }
    };
    primarySecNos.current = new Set();
    collect(treeData ?? []);
  }, [treeData]);

  if (selectedCodes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        코드를 1개 이상 선택하세요.
      </p>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-0 border rounded-lg overflow-hidden lg:min-h-[600px]">
      {/* Sidebar TOC — full tree from primary code */}
      <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r flex-shrink-0 overflow-y-auto bg-muted/20 max-h-64 lg:max-h-none">
        <div className="p-2 text-xs font-semibold text-muted-foreground border-b px-3 py-2 flex items-center gap-2">
          <span>목차 ({primaryCode})</span>
          {treeLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
        </div>
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

      {/* Body columns */}
      <div className="flex-1 overflow-auto">
        {activeSecNo ? (
          <div className="h-full flex flex-col">
            {/* Section header */}
            <div className="border-b px-4 py-3 bg-background sticky top-0 z-10">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-primary font-bold">{activeSecNo}</span>
                <span className="text-xs text-muted-foreground">
                  ({selectedCodes.length}개 코드 비교)
                </span>
              </div>
            </div>

            {/* Code columns — stack on mobile, side-by-side on lg+ */}
            <div
              className="flex-1 grid grid-cols-1 divide-y lg:divide-y-0 lg:divide-x overflow-auto lg:[grid-template-columns:var(--cols)]"
              style={
                {
                  '--cols': `repeat(${selectedCodes.length}, minmax(0, 1fr))`,
                } as React.CSSProperties
              }
            >
              {selectedCodes.map((code) => {
                const familyId = CODE_TO_FAMILY[code];
                const isPresent =
                  code === primaryCode
                    ? primarySecNos.current.has(activeSecNo)
                    : true; // other codes: optimistic, API returns 404 if absent
                return (
                  <article key={code} className="p-4 flex flex-col gap-2 lg:overflow-y-auto lg:max-h-[600px]">
                    <div className="flex items-center gap-2 flex-wrap sticky top-0 bg-background pb-2 border-b mb-1">
                      <h3 className="font-mono font-bold text-primary">{code}</h3>
                      {familyId && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                          패밀리 {familyId}
                        </span>
                      )}
                    </div>
                    <RecursiveBodyColumn
                      code={code}
                      secNo={activeSecNo}
                      isPresent={isPresent}
                    />
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm py-8 text-center">
            좌측 목차에서 섹션을 선택하세요.
          </p>
        )}
      </div>
    </div>
  );
}
