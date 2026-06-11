import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileDown, Info, ScrollText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import snapshot from '@/data/industrial-convergence-forms.json';

export const metadata: Metadata = {
  title: '산업융합 촉진법 별표·서식 다운로드',
  description:
    '산업융합 촉진법 시행령·시행규칙의 별표 및 서식(HWP) 다운로드 · 출처 국가법령정보센터(law.go.kr)',
};

interface FormEntry {
  number: string;
  branchNumber: string;
  kind: string; // 별표 / 서식
  title: string;
  hwpFileName: string;
  downloadUrl: string;
}

interface LawGroup {
  key: string;
  lawName: string;
  mst: string;
  forms: FormEntry[];
}

interface FormsSnapshot {
  source: string;
  fetchedAt: string;
  laws: LawGroup[];
}

const data = snapshot as FormsSnapshot;

/** 별표번호(0001) + 가지번호(00) → "1" 또는 "1의2" 표기 */
function displayNumber(form: FormEntry): string {
  const base = String(parseInt(form.number, 10) || form.number);
  const branch = parseInt(form.branchNumber, 10);
  return branch > 0 ? `${base}의${branch}` : base;
}

function FormRow({ form }: { form: FormEntry }) {
  const label = `${form.kind} ${displayNumber(form)}`;
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Badge
          variant="secondary"
          className="mt-0.5 shrink-0 font-mono tabular-nums"
        >
          {label}
        </Badge>
        <p className="min-w-0 text-sm leading-relaxed text-foreground">
          {form.title}
        </p>
      </div>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="shrink-0 self-start sm:self-auto"
      >
        <a href={form.downloadUrl} rel="noopener noreferrer">
          <FileDown className="h-4 w-4" />
          HWP 다운로드
        </a>
      </Button>
    </div>
  );
}

export default function IndustrialConvergenceFormsPage() {
  const totalCount = data.laws.reduce((acc, g) => acc + g.forms.length, 0);
  const fetchedDate = new Date(data.fetchedAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="mx-auto max-w-4xl">
      {/* Back link */}
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        법령 검색으로
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-[hsl(var(--brass))]">
          <ScrollText className="h-5 w-5" strokeWidth={1.75} />
          <span className="text-xs font-semibold uppercase tracking-wider">
            별표 · 서식 다운로드
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          산업융합 촉진법 별표·서식
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          시행령·시행규칙의 공식 별표 및 서식 {totalCount}건을 한글(HWP) 파일로
          내려받을 수 있습니다.
        </p>
      </div>

      {/* Legal attribution notice */}
      <div className="mb-8 flex gap-3 rounded-lg border border-border/70 bg-secondary/40 p-4">
        <Info
          className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brass))]"
          strokeWidth={2}
        />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            법령 서식은 저작권 보호 대상이 아니며(저작권법 제7조) 자유롭게 이용
            가능합니다. 최신본은 국가법령정보센터에서 확인하세요.
          </p>
          <p className="text-xs">
            출처: 국가법령정보센터 (law.go.kr) · 기준일 {fetchedDate}
          </p>
        </div>
      </div>

      {/* Form groups by law */}
      <div className="space-y-8">
        {data.laws.map((group) => (
          <Card key={group.key}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg">{group.lawName}</CardTitle>
                <Badge variant="outline" className="shrink-0 tabular-nums">
                  {group.forms.length}건
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {group.forms.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  현재 표시할 별표·서식이 없습니다.
                </p>
              ) : (
                <div>
                  {group.forms.map((form) => (
                    <FormRow
                      key={`${group.key}-${form.number}-${form.branchNumber}`}
                      form={form}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer source line */}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        출처: 국가법령정보센터 (law.go.kr) · 본 페이지는 공식 법령 서식을 안내합니다.
      </p>
    </div>
  );
}
