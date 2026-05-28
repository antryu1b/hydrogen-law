import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface ArticleRow {
  id: string;
  law_name: string;
  article_no: string;
  title: string | null;
  content: string;
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ygohwygdwbckgtotlogm.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured', content: null }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { law_name, article_number } = await request.json();

    if (!law_name) {
      return NextResponse.json({ error: 'law_name required', content: null }, { status: 400 });
    }

    const articleMatch = article_number?.match(/제\d+조(?:의\d+)?/);
    const normalizedArticle = articleMatch ? articleMatch[0] : null;

    const cleanLawName = law_name.replace(/\s+/g, ' ').trim();

    let query = supabase
      .from('law_articles')
      .select('id, law_name, article_no, title, content')
      .order('article_no');

    query = query.or(`law_name.eq.${cleanLawName},law_name.ilike.%${cleanLawName.slice(0, 12)}%`);

    if (normalizedArticle) {
      // Fetch ALL rows matching the article number (could be multiple paragraphs)
      query = query.eq('article_no', normalizedArticle).limit(20);
    } else {
      query = query.limit(5);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message, content: null }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        error: `데이터 없음: ${law_name} ${article_number || ''}`.trim(),
        content: null,
      });
    }

    const rows = data as ArticleRow[];

    // Prefer exact law_name match; otherwise first row's law_name as anchor
    const exactRows = rows.filter(r => r.law_name === cleanLawName);
    const target = exactRows.length > 0 ? exactRows : rows.filter(r => r.law_name === rows[0].law_name);

    // Merge all content for the same article_no within the same law (deduplicate)
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const r of target) {
      const trimmed = r.content.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        parts.push(trimmed);
      }
    }
    const mergedContent = parts.join('\n\n');

    return NextResponse.json({
      content: mergedContent,
      found: true,
      law_name: target[0].law_name,
      article_no: target[0].article_no,
      title: target[0].title,
      row_count: target.length,
    });

  } catch (error) {
    return NextResponse.json({
      error: `오류: ${error instanceof Error ? error.message : String(error)}`,
      content: null,
    }, { status: 500 });
  }
}
