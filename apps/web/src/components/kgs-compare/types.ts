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

export type ViewMode = 'A' | 'B' | 'C';
