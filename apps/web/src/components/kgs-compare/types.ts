export interface CanonicalTocEntry {
  sec_no: string;
  title: string;
  level: number;
  codes: Record<
    string,
    {
      present: boolean;
      matched_sec_no: string;
      matched_title: string;
      body_chars: number;
      is_umbrella: boolean;
    }
  >;
  title_per_family?: Record<string, string>;
  title_variant_note?: string;
}

export interface CanonicalFamily {
  id: string;
  label: string;
  members: string[];
  canonical_toc: CanonicalTocEntry[];
}

export interface CanonicalTocData {
  version: string;
  families: CanonicalFamily[];
  universal: CanonicalTocEntry[];
}

export interface SectionBody {
  code: string;
  sec_no: string;
  title: string;
  body: string;
  level: number;
  is_umbrella: boolean;
  body_chars: number;
}

export interface EquationRegion {
  page: number;
  bbox: [number, number, number, number];
  id: string;
  /** Precomputed Tesseract OCR text (only present when ocr_good). */
  ocr_text?: string;
  /** Mean per-word Tesseract confidence (0–100). */
  ocr_confidence?: number;
  /**
   * True when OCR passed the confidence + text-quality gate. When false the UI
   * shows a "원본 PDF에서 확인" note instead of garbled text (legal site).
   */
  ocr_good?: boolean;
}

export type BodyStatus = 'has_body' | 'umbrella' | 'deleted' | 'inline_title' | 'artifact';

export interface SectionBlock {
  sec_no: string;
  title: string;
  level: number;
  body: string;
  is_umbrella: boolean;
  body_status?: BodyStatus;
  body_chars: number;
  equation_regions?: EquationRegion[];
  page_start?: number;
  page_end?: number;
}

export interface RecursiveSectionBodyResponse {
  code: string;
  root: { sec_no: string; title: string; body: string; is_umbrella: boolean };
  blocks: SectionBlock[];
  total_blocks: number;
  total_body_chars: number;
}

export interface TreeNode {
  sec_no: string;
  /** Unique render key (sec_no may not be unique in KGS data due to table rows) */
  _key: string;
  title: string;
  level: number;
  is_umbrella: boolean;
  is_appendix?: boolean;
  appendix_kind?: string;
  appendix_no?: string;
  /** Marks the synthetic appendix group root (__appendix__) */
  _appendix_group?: boolean;
  body_chars: number;
  children: TreeNode[];
}

export interface SectionsTreeResponse {
  code: string;
  total_sections: number;
  total_appendix?: number;
  tree: TreeNode[];
}

export type ViewMode = 'A' | 'B' | 'C';
