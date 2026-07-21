'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Loader2, Search, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: string[];
  loading?: boolean;
}

const SUGGESTED_QUESTIONS = [
  '수소탱크 고압가스 안전거리 기준은?',
  '수소충전소 설치 허가 절차가 어떻게 되나요?',
  '수전해 설비 관련 법령을 알려주세요',
  '고압가스 저장탱크 내진기준은?',
];

const TOOL_LABELS: Record<string, string> = {
  hydro_search: '법령 검색 중',
  hydro_detail: '조문 상세 조회 중',
  hydro_compare: 'KGS 코드 비교 중',
};

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTools]);

  const toggleExpand = (id: string) => {
    setExpandedMsgs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', text };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', text: '', toolCalls: [], loading: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);
    setActiveTools([]);

    const history = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.text,
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.body) throw new Error('스트림 없음');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      const toolCalls: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'text') {
            fullText += data.text;
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id ? { ...m, text: fullText } : m
            ));
          } else if (data.type === 'tool_start') {
            setActiveTools(prev => [...prev, data.name]);
            if (!toolCalls.includes(data.name)) toolCalls.push(data.name);
          } else if (data.type === 'tool_end') {
            setActiveTools(prev => prev.filter(t => t !== data.name));
          } else if (data.type === 'done') {
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id ? { ...m, loading: false, toolCalls } : m
            ));
          } else if (data.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id ? { ...m, text: `오류: ${data.message}`, loading: false } : m
            ));
          }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id
          ? { ...m, text: `오류가 발생했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, loading: false }
          : m
      ));
    } finally {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id && m.loading ? { ...m, loading: false } : m
      ));
      setLoading(false);
      setActiveTools([]);
      inputRef.current?.focus();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col gap-3">
      {/* 입력창 — 항상 상단 */}
      <div>
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="법령 관련 질문을 입력하세요..."
            className="h-11 flex-1"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()} className="h-11 px-4">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </form>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          AI 답변은 법적 효력이 없습니다. 반드시 원문 조문을 확인하세요.
        </p>
      </div>

      {/* 추천 질문 — 대화 없을 때만 */}
      {isEmpty && (
        <div className="fadeIn">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> 추천 질문
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={loading}
                className="text-left text-sm px-3.5 py-2 rounded-lg border border-border/80 bg-card/60 hover:border-[hsl(var(--brass)/0.5)] hover:bg-accent transition-all disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 대화 영역 */}
      {!isEmpty && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2.5 fadeIn ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}

              <div className={`max-w-[85%] space-y-1 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <button
                    onClick={() => toggleExpand(msg.id)}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Search className="w-3 h-3" />
                    법령 {msg.toolCalls.length}회 검색
                    {expandedMsgs.has(msg.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
                {expandedMsgs.has(msg.id) && msg.toolCalls && (
                  <div className="flex flex-col gap-1 fadeIn">
                    {msg.toolCalls.map((t, i) => (
                      <span key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                        {TOOL_LABELS[t] ?? t}
                      </span>
                    ))}
                  </div>
                )}

                <div className={`px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm whitespace-pre-wrap'
                    : 'bg-card border border-border/70 rounded-tl-sm prose prose-sm dark:prose-invert max-w-none'
                }`}>
                  {msg.loading && !msg.text ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>답변 생성 중...</span>
                    </span>
                  ) : msg.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text || ''}</ReactMarkdown>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            </div>
          ))}

          {activeTools.length > 0 && (
            <div className="pl-9 space-y-1.5 fadeIn">
              {activeTools.map((tool, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  <span>{TOOL_LABELS[tool] ?? '처리 중'}...</span>
                </div>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

    </div>
  );
}
