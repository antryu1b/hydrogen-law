'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';

interface UploadResult {
  status: string;
  law_name: string;
  law_id: string;
  stats: {
    total_text_length: number;
    articles_found: number;
    chunks_created: number;
    articles: { article_number: string; title: string }[];
  };
  supabase: {
    migrated: number;
    failed: number;
    error?: string;
  };
  supabase_verification: {
    document_count: number;
  } | null;
}

export default function UploadPage() {
  const [lawName, setLawName] = useState('');
  const [lawId, setLawId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError('PDF 파일을 선택해주세요.');
      return;
    }
    if (!lawName.trim()) {
      setError('법령명을 입력해주세요.');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('law_name', lawName.trim());
      if (lawId.trim()) {
        formData.append('law_id', lawId.trim());
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '업로드 실패');
      }

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '업로드 중 오류가 발생했습니다.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setError(null);

    if (selected && !lawName.trim()) {
      const name = selected.name
        .replace(/\.pdf$/i, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      setLawName(name);
    }
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-16">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <Link href="/search" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            검색으로 돌아가기
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">법령 업로드</h1>
              <p className="text-sm text-muted-foreground">
                PDF 파일을 업로드하면 자동으로 파싱, 인덱싱, 검색 연동됩니다
              </p>
            </div>
          </div>
        </div>

        {/* Upload Form */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              법령 PDF 업로드
            </CardTitle>
            <CardDescription>
              법령 PDF를 업로드하면 조문 파싱 → 청킹 → 임베딩 → Supabase 저장이 자동으로 수행됩니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              {/* File Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">PDF 파일</label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {(file.size / 1024 / 1024).toFixed(1)}MB
                      </Badge>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        클릭하여 PDF 파일을 선택하세요
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Law Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">법령명 (필수)</label>
                <Input
                  type="text"
                  value={lawName}
                  onChange={(e) => setLawName(e.target.value)}
                  placeholder="예: 고압가스 안전관리법"
                  className="h-12"
                />
              </div>

              {/* Law ID (optional) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  법령 ID <span className="text-muted-foreground">(선택)</span>
                </label>
                <Input
                  type="text"
                  value={lawId}
                  onChange={(e) => setLawId(e.target.value)}
                  placeholder="예: 276461 (국가법령정보센터 ID)"
                  className="h-12"
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={uploading || !file || !lawName.trim()}
                className="w-full h-12 text-base font-semibold"
                size="lg"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    처리 중... (파싱 → 임베딩 → 저장)
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 mr-2" />
                    업로드 및 인덱싱
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">업로드 실패</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {result && (
          <Card className="border-2 border-green-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-5 h-5" />
                업로드 완료
              </CardTitle>
              <CardDescription>
                {result.law_name} - 검색 시스템에 연동되었습니다
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-2xl font-bold">{result.stats.articles_found}</p>
                  <p className="text-xs text-muted-foreground">파싱된 조문</p>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-2xl font-bold">{result.stats.chunks_created}</p>
                  <p className="text-xs text-muted-foreground">생성된 청크</p>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <p className="text-2xl font-bold">{result.supabase.migrated}</p>
                  <p className="text-xs text-muted-foreground">Supabase 저장</p>
                </div>
              </div>

              {result.supabase.failed > 0 && (
                <div className="flex items-center gap-2 text-sm text-yellow-600">
                  <AlertCircle className="w-4 h-4" />
                  Supabase 저장 실패: {result.supabase.failed}건
                </div>
              )}

              {result.supabase_verification && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  Supabase 검증 완료: {result.supabase_verification.document_count}개 문서 확인
                </div>
              )}

              <Separator />

              {/* Article list */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">파싱된 조문 목록</p>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {result.stats.articles.map((article, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm py-1">
                      <Badge variant="outline" className="text-xs font-mono">
                        {article.article_number}
                      </Badge>
                      <span className="text-muted-foreground">{article.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <Link href="/search">
                <Button variant="outline" className="w-full">
                  검색 페이지에서 확인하기
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Pipeline Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">자동 처리 파이프라인</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
              <Badge variant="secondary">1. PDF 텍스트 추출</Badge>
              <span className="hidden sm:inline">→</span>
              <Badge variant="secondary">2. 조문 파싱</Badge>
              <span className="hidden sm:inline">→</span>
              <Badge variant="secondary">3. 청킹 (512자)</Badge>
              <span className="hidden sm:inline">→</span>
              <Badge variant="secondary">4. 임베딩 생성</Badge>
              <span className="hidden sm:inline">→</span>
              <Badge variant="secondary">5. DB 저장</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
