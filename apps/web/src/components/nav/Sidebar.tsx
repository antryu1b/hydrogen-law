'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  TrendingUp,
  BarChart2,
  Scale,
  Award,
  Search,
  Columns2,
  Network,
  FolderTree,
  FileText,
  ShieldCheck,
  Upload,
  BookOpen,
} from 'lucide-react';
import {
  NAV_MAIN,
  NAV_ADMIN,
  isSectionActive,
  isSubItemActive,
  type NavSection,
} from './navConfig';

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  '수전해 동향': TrendingUp,
  '경쟁사 비교': BarChart2,
  '법령 검색': Scale,
  '특허 분석': Award,
};

const SUB_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  '검색': Search,
  '본문 비교': Columns2,
  '통합 요건': Network,
  '기술기준 분류': FolderTree,
  '별표·서식': FileText,
  '컴플라이언스 체크': ShieldCheck,
};

const ADMIN_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  '법령 업로드': Upload,
  '인텔 업로드': BookOpen,
};

function SidebarInner({ onItemClick }: { onItemClick?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');

  const handleLawHomeClick = () => {
    onItemClick?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('hl-go-home'));
    }
  };

  const renderSection = (section: NavSection) => {
    const Icon = SECTION_ICONS[section.label];
    const active = isSectionActive(section, pathname, tab);

    if (section.subItems) {
      return (
        <div key={section.label} className="space-y-0.5">
          {/* Section header (non-clickable label for sections with sub-items) */}
          <div
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              active
                ? 'text-[hsl(var(--brass))]'
                : 'text-muted-foreground'
            }`}
          >
            {Icon && (
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                  active
                    ? 'border-[hsl(var(--brass)/0.4)] bg-[hsl(var(--brass)/0.1)] text-[hsl(var(--brass))]'
                    : 'border-border/60 bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} />
              </span>
            )}
            {section.label}
          </div>
          {/* Sub-items */}
          <div className="pl-3 space-y-0.5">
            {section.subItems.map((sub) => {
              const SubIcon = SUB_ICONS[sub.label];
              const subActive = isSubItemActive(sub, pathname);
              const isLawHome = sub.href === '/';
              return (
                <Link
                  key={sub.href}
                  href={sub.href}
                  onClick={isLawHome ? handleLawHomeClick : onItemClick}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    subActive
                      ? 'bg-[hsl(var(--brass)/0.1)] text-[hsl(var(--brass))] font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {SubIcon && (
                    <SubIcon
                      className={`h-3.5 w-3.5 shrink-0 ${subActive ? 'text-[hsl(var(--brass))]' : 'text-muted-foreground/70'}`}
                      strokeWidth={1.75}
                    />
                  )}
                  {sub.label}
                </Link>
              );
            })}
          </div>
        </div>
      );
    }

    // Top-level section with direct href (intel tabs)
    return (
      <Link
        key={section.href + section.tab}
        href={section.href}
        onClick={onItemClick}
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          active
            ? 'bg-[hsl(var(--brass)/0.1)] text-[hsl(var(--brass))] font-semibold border border-[hsl(var(--brass)/0.25)]'
            : 'text-foreground/85 hover:bg-accent hover:text-foreground'
        }`}
      >
        {Icon && (
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
              active
                ? 'border-[hsl(var(--brass)/0.4)] bg-[hsl(var(--brass)/0.1)] text-[hsl(var(--brass))]'
                : 'border-border/60 bg-muted text-muted-foreground'
            }`}
          >
            <Icon className="h-[13px] w-[13px]" strokeWidth={1.75} />
          </span>
        )}
        {section.label}
      </Link>
    );
  };

  return (
    <nav className="flex flex-col h-full py-4 px-3 space-y-1" aria-label="주 메뉴">
      {/* Main sections */}
      <div className="space-y-1">
        {NAV_MAIN.map(renderSection)}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Admin group */}
      <div className="pt-4 border-t border-border/60">
        <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
          관리
        </p>
        <div className="space-y-0.5">
          {NAV_ADMIN.map((item) => {
            const Icon = ADMIN_ICONS[item.label];
            const active = isSubItemActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onItemClick}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-[hsl(var(--brass)/0.1)] text-[hsl(var(--brass))] font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {Icon && (
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[hsl(var(--brass))]' : 'text-muted-foreground/70'}`}
                    strokeWidth={1.75}
                  />
                )}
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/**
 * Sidebar navigation panel.
 * Wraps SidebarInner in Suspense so useSearchParams doesn't block static generation.
 */
export function Sidebar({ onItemClick }: { onItemClick?: () => void }) {
  return (
    <Suspense fallback={null}>
      <SidebarInner onItemClick={onItemClick} />
    </Suspense>
  );
}
