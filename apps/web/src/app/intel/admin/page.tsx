import type { Metadata } from 'next';
import Link from 'next/link';
import { UploadForm } from './UploadForm';

export const metadata: Metadata = { title: '인텔리전스 데이터 업로드 · 수소법령 검색' };

export default function IntelAdminPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/intel" className="text-xs text-muted-foreground hover:text-foreground">
          ← 수전해 인텔리전스
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">데이터 업로드</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          경쟁사 비교 · 특허 분석 내용을 JSON 파일로 갱신합니다. 재배포가 필요 없습니다.
        </p>
      </div>
      <div className="rounded-lg border border-border/80 bg-card p-6">
        <UploadForm />
      </div>
      <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          파일 형식은 시드 파일(<code>scripts/intel/extract.mjs</code> 출력)과 같습니다:{' '}
          <code>{'{ "table": "intel_competitors" | "intel_patents", "rows": [{ "id", "section", "sort", "payload" }] }'}</code>
        </p>
        <p>
          같은 <code>id</code> 는 덮어쓰고(upsert) 새 <code>id</code> 는 추가합니다. &ldquo;파일에 없는 행 삭제&rdquo;를
          켜면 해당 테이블에서 이번 파일에 없는 행이 지워집니다.
        </p>
      </div>
    </div>
  );
}
