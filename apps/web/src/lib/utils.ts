import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 법령 구분(법률/시행령/시행규칙)을 메타 law_type + 법령명에서 추론한다.
 * 🔴 메타 law_type 이 비어오면 '법률'로 기본값 떨어지던 버그 방지 —
 * "석유광산안전규칙"처럼 이름이 '규칙'으로 끝나는 독립 부령(시행규칙급)을
 * 법률로 오분류하지 않도록 이름 기반 보정을 포함.
 */
export function deriveLawType(lawName: string, lawType?: string | null): string {
  const t = (lawType || '').toLowerCase();
  const n = lawName || '';
  // 1) 명시적 구분값 우선 (부령/총리령/대통령령 등 정식 명칭 포함)
  if (t.includes('시행규칙') || t.includes('부령') || t.includes('총리령') || n.includes('시행규칙')) return '시행규칙';
  if (t.includes('시행령') || t.includes('대통령령') || n.includes('시행령')) return '시행령';
  // 2) 이름 기반 보정 (괄호·별표·부칙 꼬리 제거 후 어미 판정)
  const base = n.replace(/\s*\(.*$/, '').replace(/\s*별표.*$/, '').replace(/\s*부칙.*$/, '').trim();
  if (base.endsWith('규칙')) return '시행규칙';
  if (base.endsWith('령')) return '시행령';
  return '법률';
}
