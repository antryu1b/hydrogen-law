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
}

export interface TreeNode {
  sec_no: string;
  title: string;
  level: number;
  is_umbrella: boolean;
  body_chars: number;
  children: TreeNode[];
}

// Cache per code
const fileCache = new Map<string, RawSection[]>();

async function getSections(code: string): Promise<RawSection[]> {
  if (fileCache.has(code)) return fileCache.get(code)!;

  const filePath = path.join(process.cwd(), 'data', 'kgs_sections', `${code}.json`);
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const sections = data.sections as RawSection[];
  fileCache.set(code, sections);
  return sections;
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
      // Fallback to string compare for non-numeric segments
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
 * "2.4.3" -> "2.4"
 * "2.4" -> "2"
 * "2" -> null
 */
function getParentSecNo(sec_no: string): string | null {
  const idx = sec_no.lastIndexOf('.');
  if (idx === -1) return null;
  return sec_no.substring(0, idx);
}

/**
 * Build a hierarchical tree from a flat sections array.
 * Returns root-level nodes only (tree is recursive via .children).
 */
function buildTree(sections: RawSection[]): TreeNode[] {
  // Sort sections by sec_no numerically
  const sorted = [...sections].sort((a, b) => compareSecNo(a.sec_no, b.sec_no));

  // Create map for fast lookup
  const nodeMap = new Map<string, TreeNode>();
  for (const s of sorted) {
    nodeMap.set(s.sec_no, {
      sec_no: s.sec_no,
      title: s.title,
      level: s.level,
      is_umbrella: s.is_umbrella ?? false,
      body_chars: s.body_chars ?? (s.body ? s.body.length : 0),
      children: [],
    });
  }

  const roots: TreeNode[] = [];

  for (const s of sorted) {
    const node = nodeMap.get(s.sec_no)!;
    const parentSecNo = getParentSecNo(s.sec_no);

    if (parentSecNo && nodeMap.has(parentSecNo)) {
      // Attach to direct parent
      nodeMap.get(parentSecNo)!.children.push(node);
    } else if (parentSecNo) {
      // Parent sec_no doesn't exist in data — try grandparent, etc.
      // Walk up until we find an existing ancestor or reach root
      let ancestor = getParentSecNo(parentSecNo);
      let found = false;
      while (ancestor !== null) {
        if (nodeMap.has(ancestor)) {
          nodeMap.get(ancestor)!.children.push(node);
          found = true;
          break;
        }
        ancestor = getParentSecNo(ancestor);
      }
      if (!found) {
        // No ancestor found, treat as root
        roots.push(node);
      }
    } else {
      // No parent possible (single-segment sec_no like "1", "2")
      roots.push(node);
    }
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
    const sections = await getSections(code);
    const tree = buildTree(sections);

    return NextResponse.json({
      code,
      total_sections: sections.length,
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
