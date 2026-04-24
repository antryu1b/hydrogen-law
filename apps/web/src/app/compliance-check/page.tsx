'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useComplianceCheck } from '@/features/compliance-check/hooks/useComplianceCheck';
import { UploadZone } from '@/features/compliance-check/components/UploadZone';
import { ComplianceResults } from '@/features/compliance-check/components/ComplianceResults';

export default function ComplianceCheckPage() {
  const [file, setFile] = useState<File | null>(null);
  const { report, loading, error, run, reset } = useComplianceCheck();

  const handleSubmit = () => {
    if (file) run(file);
  };

  const handleFileChange = (selected: File) => {
    setFile(selected);
    reset();
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            검색으로 돌아가기
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">컴플라이언스 체크</h1>
              <p className="text-sm text-muted-foreground">
                사업계획서를 업로드하면 수소법·고압가스법 기준 적용 조항을 자동으로 분석합니다
              </p>
            </div>
          </div>
        </div>

        {/* Upload form */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle>사업계획서 업로드</CardTitle>
            <CardDescription>
              PDF 또는 텍스트 파일 형식의 사업계획서를 업로드하세요.
              법령 조항을 자동으로 매칭하여 준수해야 할 항목을 알려드립니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UploadZone
              file={file}
              loading={loading}
              onFileChange={handleFileChange}
              onSubmit={handleSubmit}
            />
          </CardContent>
        </Card>

        {/* Error state */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">분석 실패</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {report && <ComplianceResults report={report} />}

        {/* Info */}
        {!report && !error && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                분석 대상: 수소경제 육성 및 수소 안전관리에 관한 법률 · 고압가스 안전관리법
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                수소충전소 / 수소생산 / 수소저장 / 수소운반 / 수소연료전지 사업 유형 지원
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
