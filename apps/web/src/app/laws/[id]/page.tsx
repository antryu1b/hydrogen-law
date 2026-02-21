import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { Scale, ArrowLeft, FileText, Tag } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface LawDocument {
  id: string;
  content: string;
  metadata: {
    law_name?: string;
    article_number?: string;
    title?: string;
    article_type?: 'article' | 'appendix';
  };
}

async function getLawDocument(id: string): Promise<LawDocument | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('law_documents')
    .select('id, content, metadata')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as LawDocument;
}

export default async function LawDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await getLawDocument(decodeURIComponent(id));

  if (!doc) {
    notFound();
  }

  const lawName = doc.metadata.law_name || '법령';
  const articleNumber = doc.metadata.article_number || doc.id;
  const title = doc.metadata.title || '';
  const articleType = doc.metadata.article_type || 'article';

  // 본문 포맷팅
  const formattedContent = doc.content
    .replace(/\n\n+/g, '\n\n')
    .split('\n\n')
    .filter(Boolean);

  return (
    <div className="min-h-screen px-3 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-4xl mx-auto">
      {/* 뒤로 가기 */}
      <div className="mb-4 sm:mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs sm:text-sm">
            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            검색으로 돌아가기
          </Button>
        </Link>
      </div>

      {/* 법령 정보 카드 */}
      <Card className="border-2 mb-4 sm:mb-6">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="p-2 sm:p-2.5 bg-primary/10 rounded-lg flex-shrink-0">
              <Scale className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div className="space-y-1.5 sm:space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg sm:text-2xl">{lawName}</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <Badge variant="default" className="text-xs sm:text-sm">
                  <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                  {articleNumber}
                </Badge>
                {articleType === 'appendix' && (
                  <Badge variant="secondary" className="text-xs">별표</Badge>
                )}
              </div>
              {title && (
                <CardDescription className="text-sm sm:text-base">{title}</CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 본문 내용 */}
      <Card className="border-2">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Tag className="w-4 h-4 sm:w-5 sm:h-5" />
            조문 내용
          </CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="p-4 sm:p-6">
          <div className="prose prose-sm sm:prose-base max-w-none dark:prose-invert">
            {formattedContent.map((paragraph, i) => (
              <p
                key={i}
                className="text-sm sm:text-base leading-relaxed text-foreground/90 mb-3 sm:mb-4 last:mb-0 whitespace-pre-wrap"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 메타 정보 */}
      <div className="mt-4 sm:mt-6 text-center">
        <p className="text-xs text-muted-foreground">
          문서 ID: {doc.id}
        </p>
      </div>
    </div>
  );
}
