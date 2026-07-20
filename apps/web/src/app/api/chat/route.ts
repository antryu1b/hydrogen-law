import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

function getInternalBaseUrl(): string {
  // Vercel 서버리스에서 자기 자신의 API 호출 시 절대 URL 필요
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return 'http://localhost:3000';
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'hydro_search',
    description: '수소·고압가스 법령을 키워드로 검색합니다. 법령명, 조문 내용, 별표 등을 검색할 수 있습니다.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색어 (예: "수소 충전소 이격거리")' },
        top_k: { type: 'number', description: '반환 결과 수 (기본 10)', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'hydro_detail',
    description: '특정 법령의 조문 본문을 상세 조회합니다.',
    input_schema: {
      type: 'object',
      properties: {
        law_name: { type: 'string', description: '법령명 (예: "고압가스 안전관리법 시행규칙")' },
        article_number: { type: 'string', description: '조번호 (예: "제64조", "별표 4")' },
      },
      required: ['law_name'],
    },
  },
  {
    name: 'hydro_compare',
    description: 'KGS 코드 배열로 상세기준 비교표를 조회합니다.',
    input_schema: {
      type: 'object',
      properties: {
        codes: {
          type: 'array',
          items: { type: 'string' },
          description: '비교할 KGS 코드 배열 (예: ["KGS AA111", "KGS AB211"])',
        },
      },
      required: ['codes'],
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const baseUrl = getInternalBaseUrl();

  if (name === 'hydro_search') {
    const res = await fetch(`${baseUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input.query, top_k: input.top_k ?? 10 }),
    });
    const data = await res.json();
    // 상위 10건 요약만 반환 (컨텍스트 절약)
    const articles = (data.articles ?? []).slice(0, 10).map((a: Record<string, string>) => ({
      law: a.law_name,
      article: a.article_number,
      title: a.title,
      content: (a.content ?? '').slice(0, 300),
    }));
    return JSON.stringify({ total: data.total_found, articles });
  }

  if (name === 'hydro_detail') {
    const res = await fetch(`${baseUrl}/api/law-detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ law_name: input.law_name, article_number: input.article_number }),
    });
    const data = await res.json();
    return JSON.stringify(data);
  }

  if (name === 'hydro_compare') {
    const res = await fetch(`${baseUrl}/api/kgs/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes: input.codes }),
    });
    const data = await res.json();
    return JSON.stringify(data);
  }

  return JSON.stringify({ error: `알 수 없는 툴: ${name}` });
}

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));

      try {
        let currentMessages: Anthropic.MessageParam[] = messages;

        // tool use 루프
        while (true) {
          const response = await client.messages.create({
            model: 'claude-sonnet-4-6[1m]',
            max_tokens: 4096,
            system: `당신은 수소·고압가스 법령 전문 AI 어시스턴트입니다.
사용자의 질문에 대해 관련 법령을 검색하고 정확한 법적 근거와 함께 답변합니다.
답변 시 반드시 법령명, 조문번호를 명시하세요.
한국어로 답변하세요.`,
            tools: TOOLS,
            messages: currentMessages,
          });

          // 텍스트 블록 스트리밍
          for (const block of response.content) {
            if (block.type === 'text') {
              send(JSON.stringify({ type: 'text', text: block.text }));
            }
          }

          if (response.stop_reason !== 'tool_use') break;

          // tool use 처리 — 모든 tool_result를 하나의 user 메시지에 담아야 함
          const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            send(JSON.stringify({ type: 'tool_start', name: toolUse.name }));
            const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
            send(JSON.stringify({ type: 'tool_end', name: toolUse.name }));
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
          }

          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ];
        }

        send(JSON.stringify({ type: 'done' }));
      } catch (err) {
        send(JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : '오류가 발생했습니다.' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
