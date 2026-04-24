import { NextResponse } from 'next/server';

const RAG_ENGINE_URL = process.env.RAG_ENGINE_URL || 'http://localhost:8000';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일을 선택해주세요' }, { status: 400 });
    }

    const fname = file.name.toLowerCase();
    if (!fname.endsWith('.pdf') && !fname.endsWith('.txt') && !fname.endsWith('.text')) {
      return NextResponse.json(
        { error: 'PDF 또는 텍스트 파일만 지원합니다' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '파일 크기는 20MB를 초과할 수 없습니다' }, { status: 400 });
    }

    // Forward to Python RAG engine
    const upstream = new FormData();
    upstream.append('file', file, file.name);

    const response = await fetch(`${RAG_ENGINE_URL}/compliance/check`, {
      method: 'POST',
      body: upstream,
      signal: AbortSignal.timeout(30_000),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || '컴플라이언스 체크 실패' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
