import { NextResponse } from 'next/server';
import { getKgsCanonicalToc } from '@/lib/kgs-source';

export async function GET() {
  try {
    return NextResponse.json(await getKgsCanonicalToc());
  } catch (error) {
    console.error('Failed to read canonical TOC:', error);
    return NextResponse.json({ error: 'Failed to load canonical TOC' }, { status: 500 });
  }
}
