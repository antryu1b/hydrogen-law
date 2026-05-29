import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface RawSection {
  sec_no: string;
  title: string;
  level: number;
  body?: string;
  body_chars?: number;
  is_umbrella?: boolean;
  is_appendix?: boolean;
  appendix_kind?: string;
  appendix_no?: string;
  /** Set by cleanup_orphans.py — table-row fragments mistakenly parsed as sections */
  is_orphan_artifact?: boolean;
}

export interface TreeNode {
  sec_no: string;
  /** Unique key for tree rendering when sec_no is not unique */
  _key: string;
  title: string;
  level: number;
  is_umbrella: boolean;
  is_appendix?: boolean;
  appendix_kind?: string;
  appendix_no?: string;
  body_chars: number;
  children: TreeNode[];
  /** Marks the synthetic appendix group root */
  _appendix_group?: boolean;
}

interface RawSectionFile {
  sections: RawSection[];
  appendix_sections?: RawSection[];
}

// Cache per code
const fileCache = new Map<string, { sections: RawSection[]; appendix_sections: RawSection[] }>();

async function getSections(code: string): Promise<{ sections: RawSection[]; appendix_sections: RawSection[] }> {
  if (fileCache.has(code)) return fileCache.get(code)!;

  const filePath = path.join(process.cwd(), 'data', 'kgs_sections', `${code}.json`);
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw) as RawSectionFile;
  const result = {
    sections: data.sections as RawSection[],
    appendix_sections: (data.appendix_sections ?? []) as RawSection[],
  };
  fileCache.set(code, result);
  return result;
}

/**
 * Compare two sec_no strings numerically segment by segment.
 * e.g. "1.10.2" > "1.9.3"
 */
function compareSecNo(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i++) {
    const aNum = parseInt(aParts[i] ?? '0', 10);
    const bNum = parseInt(bParts[i] ?? '0', 10);
    if (isNaN(aNum) || isNaN(bNum)) {
      const aStr = aParts[i] ?? '';
      const bStr = bParts[i] ?? '';
      if (aStr < bStr) return -1;
      if (aStr > bStr) return 1;
    } else {
      if (aNum !== bNum) return aNum - bNum;
    }
  }
  return 0;
}

/**
 * Given a sec_no string, return its parent sec_no or null.
 * "2.4.3" -> "2.4", "2.4" -> "2", "2" -> null
 */
function getParentSecNo(sec_no: string): string | null {
  const idx = sec_no.lastIndexOf('.');
  if (idx === -1) return null;
  return sec_no.substring(0, idx);
}

/**
 * Build a hierarchical tree from a flat sections array.
 *
 * Dedup policy (applied 2026-05-29 per Andrew C+2 follow-up):
 * Duplicate sec_nos in source data are PDF parser artifacts (table rows where
 * cell content happens to match a section-number regex). We keep ONLY the
 * first occurrence of each sec_no — first one is always the real section
 * header (per Phase 1 parser ordering), subsequent ones are appendix/table
 * row contamination. This prevents the tree from showing "1 일반사항"
 * multiple times at the root level.
 */
function buildTree(sections: RawSection[], appendix_sections: RawSection[]): TreeNode[] {
  // Sort sections by sec_no numerically, preserving original order for equal sec_nos
  const indexed = sections.map((s, i) => ({ ...s, _origIdx: i }));
  const sorted = indexed.sort((a, b) => {
    const cmp = compareSecNo(a.sec_no, b.sec_no);
    return cmp !== 0 ? cmp : a._origIdx - b._origIdx;
  });

  // Dedup: keep only first occurrence per sec_no (filter table-row artifacts)
  const seen = new Set<string>();
  const deduped = sorted.filter((s) => {
    if (seen.has(s.sec_no)) return false;
    seen.add(s.sec_no);
    return true;
  });

  // Skip orphan artifacts (body-text table fragments flagged by cleanup_orphans.py)
  const cleaned = deduped.filter((s) => !s.is_orphan_artifact);

  // Build nodes with unique _key (still useful for React even when sec_nos are now unique)
  const nodes: (TreeNode & { _parentSecNo: string | null })[] = cleaned.map((s, i) => ({
    _key: `${s.sec_no}__${i}`,
    sec_no: s.sec_no,
    title: s.title,
    level: s.level,
    is_umbrella: s.is_umbrella ?? false,
    body_chars: s.body_chars ?? (s.body ? s.body.length : 0),
    children: [],
    _parentSecNo: getParentSecNo(s.sec_no),
  }));

  // Each sec_no now maps to a single canonical node
  const nodeBySecNo = new Map<string, TreeNode>();
  for (const node of nodes) {
    nodeBySecNo.set(node.sec_no, node);
  }

  const roots: TreeNode[] = [];

  for (const node of nodes) {
    const parentSecNo = node._parentSecNo;

    if (parentSecNo && nodeBySecNo.has(parentSecNo)) {
      nodeBySecNo.get(parentSecNo)!.children.push(node);
    } else if (parentSecNo) {
      // Direct parent not in data — walk up to find nearest ancestor
      let ancestor = getParentSecNo(parentSecNo);
      let found = false;
      while (ancestor !== null) {
        if (nodeBySecNo.has(ancestor)) {
          nodeBySecNo.get(ancestor)!.children.push(node);
          found = true;
          break;
        }
        ancestor = getParentSecNo(ancestor);
      }
      if (!found) roots.push(node);
    } else {
      roots.push(node);
    }
  }

  // Build appendix group (synthetic root) if appendix sections exist
  if (appendix_sections.length > 0) {
    const appendixChildren: TreeNode[] = appendix_sections.map((s, i) => ({
      _key: `appendix__${s.sec_no}__${i}`,
      sec_no: s.sec_no,
      title: s.title,
      level: 2,
      is_umbrella: false,
      is_appendix: true,
      appendix_kind: s.appendix_kind,
      appendix_no: s.appendix_no,
      body_chars: s.body_chars ?? (s.body ? s.body.length : 0),
      children: [],
    }));

    const appendixRoot: TreeNode = {
      _key: '__appendix__root',
      sec_no: '__appendix__',
      title: `별표·부록 (${appendixChildren.length}개)`,
      level: 0,
      is_umbrella: false,
      is_appendix: true,
      body_chars: 0,
      children: appendixChildren,
      _appendix_group: true,
    };

    roots.push(appendixRoot);
  }

  return roots;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code || !/^[A-Z0-9]{4,8}$/.test(code)) {
    return NextResponse.json({ error: 'Valid code parameter is required' }, { status: 400 });
  }

  try {
    const { sections, appendix_sections } = await getSections(code);
    const tree = buildTree(sections, appendix_sections);

    return NextResponse.json({
      code,
      total_sections: sections.length,
      total_appendix: appendix_sections.length,
      tree,
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return NextResponse.json({ error: `Code ${code} not found` }, { status: 404 });
    }
    console.error(`Failed to build tree for ${code}:`, error);
    return NextResponse.json({ error: 'Failed to build sections tree' }, { status: 500 });
  }
}
