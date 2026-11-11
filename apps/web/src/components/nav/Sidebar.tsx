'use client';

import Link from 'next/link';
import { Suspense, useState, useEffect, useId } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  TrendingUp,
  BarChart2,
  Scale,
  Award,
  Search,
  Columns2,
  Network,
  Upload,
  BookOpen,
  ChevronDown,
  Settings2,
  Building2,
  Factory,
  Lightbulb,
} from 'lucide-react';
import {
  NAV_MAIN,
  NAV_ADMIN,
  isSectionActive,
  isSubItemActive,
  shouldExpandLawSection,
  shouldExpandPatentSection,
} from './navConfig';

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  '수전해 동향': TrendingUp,
  '경쟁사 비교': BarChart2,
  '특허 분석': Award,
  '법령 검색': Scale,
};

const SUB_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  '검색': Search,
  '본문 비교': Columns2,
  '통합 요건': Network,
  '경쟁사': Building2,
  'HMG': Factory,
  '특허제안리스트': Lightbulb,
};

const ADMIN_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  '법령 업로드': Upload,
  '인텔 업로드': BookOpen,
};

function SidebarInner({ onItemClick }: { onItemClick?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const sec = searchParams.get('sec');

  const isLawActive = shouldExpandLawSection(pathname);
  const isPatentActive = shouldExpandPatentSection(pathname, tab);

  // 법령 검색 accordion state
  const [lawOpen, setLawOpen] = useState(false);
  // 특허 분석 accordion state
  const [patentOpen, setPatentOpen] = useState(false);
  // 관리 accordion state
  const [adminOpen, setAdminOpen] = useState(false);

  const lawSectionId = useId();
  const patentSectionId = useId();
  const adminSectionId = useId();

  // Restore saved accordion state from localStorage (best-effort)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nav-law-open');
      if (saved !== null) setLawOpen(saved === '1');
    } catch {}
    try {
      const saved = localStorage.getItem('nav-patent-open');
      if (saved !== null) setPatentOpen(saved === '1');
    } catch {}
    try {
      const saved = localStorage.getItem('nav-admin-open');
      if (saved !== null) setAdminOpen(saved === '1');
    } catch {}
  }, []);

  // Auto-expand law section when on a law page
  useEffect(() => {
    if (isLawActive) {
      setLawOpen(true);
      try { localStorage.setItem('nav-law-open', '1'); } catch {}
    }
  }, [isLawActive]);

  // Auto-expand patent section when on a patents view
  useEffect(() => {
    if (isPatentActive) {
      setPatentOpen(true);
      try { localStorage.setItem('nav-patent-open', '1'); } catch {}
    }
  }, [isPatentActive]);

  const lawExpanded = isLawActive || lawOpen;
  // Patents stays user-collapsible even on a patents view (auto-expands on entry).
  const patentExpanded = patentOpen;

  const toggleLaw = () => {
    // On a law page, don't allow collapsing (would hide active item)
    if (isLawActive) return;
    const next = !lawOpen;
    setLawOpen(next);
    try { localStorage.setItem('nav-law-open', next ? '1' : '0'); } catch {}
  };

  const togglePatent = () => {
    const next = !patentOpen;
    setPatentOpen(next);
    try { localStorage.setItem('nav-patent-open', next ? '1' : '0'); } catch {}
  };

  const toggleAdmin = () => {
    const next = !adminOpen;
    setAdminOpen(next);
    try { localStorage.setItem('nav-admin-open', next ? '1' : '0'); } catch {}
  };

  const handleLawHomeClick = () => {
    setLawOpen(true);
    try { localStorage.setItem('nav-law-open', '1'); } catch {}
    onItemClick?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('hl-go-home'));
    }
  };

  return (
    <div className="flex h-full flex-col">
    {/* Scrollable main navigation */}
    <nav className="flex flex-col flex-1 overflow-y-auto py-3 px-2 gap-0.5" aria-label="주 메뉴">
      {/* Main sections */}
      {NAV_MAIN.map((section) => {
        const Icon = SECTION_ICONS[section.label];
        const active = isSectionActive(section, pathname, tab);

        if (section.subItems) {
          // Collapsible sections (법령 검색, 특허 분석)
          const isPatents = section.tab === 'patents';
          const isOpen = isPatents ? patentExpanded : lawExpanded;
          const sectionId = isPatents ? patentSectionId : lawSectionId;
          const toggle = isPatents ? togglePatent : toggleLaw;
          return (
            <div key={section.label}>
              {/* Section row: label navigates, chevron button toggles */}
              <div
                className={`flex items-center rounded-lg text-sm transition-colors ${
                  active
                    ? 'text-[hsl(var(--brass))]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Link
                  href={section.href}
                  onClick={() => {
                    if (isPatents) {
                      // Already on a patents view: the label toggles the sub-menu.
                      if (isPatentActive) togglePatent();
                      else {
                        setPatentOpen(true);
                        try { localStorage.setItem('nav-patent-open', '1'); } catch {}
                      }
                    } else {
                      setLawOpen(true);
                      try { localStorage.setItem('nav-law-open', '1'); } catch {}
                    }
                    onItemClick?.();
                  }}
                  className="flex flex-1 items-center gap-2 px-3 py-2.5 font-medium"
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
                {/* Chevron-only toggle button */}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={sectionId}
                  aria-label={isOpen ? `${section.label} 접기` : `${section.label} 펼치기`}
                  onClick={toggle}
                  className="px-2 py-2.5 rounded-r-lg hover:bg-accent transition-colors"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                      isOpen ? '' : '-rotate-90'
                    }`}
                    strokeWidth={1.75}
                  />
                </button>
              </div>

              {/* Sub-items (collapsible) */}
              {isOpen && (
                <div id={sectionId} className="pl-3 mt-0.5 space-y-0.5">
                  {section.subItems.map((sub) => {
                    const SubIcon = SUB_ICONS[sub.label];
                    const subActive = isSubItemActive(sub, pathname, tab, sec);
                    const isLawHome = sub.href === '/search';
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
              )}
            </div>
          );
        }

        // Top-level section with direct href (intel tabs)
        return (
          <Link
            key={section.href + section.tab}
            href={section.href}
            onClick={onItemClick}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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
      })}
    </nav>

    {/* Admin group — pinned to bottom, collapsible */}
    <div className="shrink-0 border-t border-border/60 px-2 py-2">
        <button
          type="button"
          aria-expanded={adminOpen}
          aria-controls={adminSectionId}
          onClick={toggleAdmin}
          className="flex w-full items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left font-medium">관리</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${adminOpen ? '' : '-rotate-90'}`}
            strokeWidth={1.75}
          />
        </button>

        {adminOpen && (
          <div id={adminSectionId} className="pl-3 mt-0.5 space-y-0.5">
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
        )}
      </div>
    </div>
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
