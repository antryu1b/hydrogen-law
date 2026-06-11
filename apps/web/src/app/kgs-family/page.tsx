'use client';
import Link from 'next/link';
import { KGS_FAMILIES } from '@/data/kgs-families-display';

export default function KGSFamilyPage() {
  return (
    <main style={{ maxWidth: '90rem' }} className="mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-px w-6 bg-[hsl(var(--brass)/0.7)]" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brass))]">기술기준 분류</span>
      </div>
      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mb-2">수소 안전 기술기준, 한눈에 보는 분류</h1>
      <p className="text-muted-foreground mb-8 leading-relaxed">
        육상 수소·가스 안전 기술기준(KGS CODE 20개)은 목차 구조로 묶으면 3가지 그룹이 되고, 선박·해양(항만) 분야는 별도 기준이 적용됩니다. 같은 그룹 안의 코드를 나란히 비교하면 기준 차이만 빠르게 확인할 수 있습니다.
      </p>

      {KGS_FAMILIES.map((family) => (
        <section
          key={family.id}
          id={`family-${family.id}`}
          className="mb-10 rounded-lg border border-border/70 bg-card p-5 shadow-[0_1px_2px_-1px_hsl(var(--primary)/0.10),0_4px_16px_-10px_hsl(var(--primary)/0.10)] sm:p-6"
        >
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight mb-2">
            {family.emoji} {family.longLabel}
          </h2>
          <p className="text-sm text-muted-foreground mb-3">{family.description}</p>
          <p className="text-sm font-medium mb-4">
            <span className="text-muted-foreground">목차 흐름: </span>
            {family.flow}
          </p>
          {family.highlight && (
            <div className="bg-primary/5 border-l-4 border-primary p-3 my-4 rounded-r text-sm">
              💡 {family.highlight}
            </div>
          )}
          <h3 className="font-semibold mt-4 mb-2">소속 코드 ({family.members.length}개)</h3>
          <ul className="space-y-2 text-sm">
            {family.members.map((m) => (
              <li key={m.code} className="flex gap-3">
                <span className="font-mono font-bold text-primary min-w-[60px]">{m.code}</span>
                <span>{m.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section
        id="family-marine"
        className="mb-10 rounded-lg border border-border/70 bg-card p-5 shadow-[0_1px_2px_-1px_hsl(var(--primary)/0.10),0_4px_16px_-10px_hsl(var(--primary)/0.10)] sm:p-6"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="h-px w-6 bg-[hsl(var(--brass)/0.7)]" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--brass))]">선박·해양(항만) 기술기준</span>
        </div>
        <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight mb-2">🚢 수소 선박·해양 기술기준</h2>
        <p className="text-sm text-muted-foreground mb-4">
          선박안전법·한국선급 기반의 수소 선박·해양 기술기준입니다. KGS CODE(육상)와 별개로 선박·항만 분야에 적용됩니다.
        </p>
        <ul className="space-y-2 text-sm mb-4">
          <li className="flex gap-3">
            <span className="font-mono font-bold text-primary min-w-[88px]">잠정기준</span>
            <span>선박수소연료전지설비 잠정기준 — 해양수산부 (선박안전법 제26조 근거)</span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-bold text-primary min-w-[88px]">GC-12-K</span>
            <span>선박용 연료전지 시스템 지침 — 한국선급</span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-bold text-primary min-w-[88px]">한국선급</span>
            <span>선박 연료전지 규칙 (KRLFP)</span>
          </li>
        </ul>
        <Link href="/kgs-compare" className="text-primary hover:underline text-sm font-medium">
          선박·해양 기준 비교 보기 →
        </Link>
      </section>

      <section className="mt-10 p-5 bg-muted/30 rounded-xl">
        <h2 className="text-lg font-bold mb-2">이 분류가 왜 유용한가요?</h2>
        <p className="text-sm mb-2">
          같은 그룹 안의 다른 코드를 나란히 비교하면 기준 차이만 빠르게 보입니다.
        </p>
        <p className="text-sm">
          예: <span className="font-mono">FP217</span>(저장식 수소충전)과{' '}
          <span className="font-mono">FP216</span>(제조식 수소충전) 모두{' '}
          <strong>최대압력</strong>은 87.5MPa 동일, 단 <strong>안전거리</strong>는 5m vs 8m로 다름.
        </p>
      </section>

      <p className="text-center mt-8">
        <Link href="/" className="text-primary hover:underline">
          ← 검색으로 돌아가기
        </Link>
      </p>
    </main>
  );
}
