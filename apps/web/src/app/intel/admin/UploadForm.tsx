'use client';

import { useState } from 'react';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; text: string } | { kind: 'error'; text: string };

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus({ kind: 'busy' });
    try {
      let parsed: { table?: string; rows?: unknown[] };
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        setStatus({ kind: 'error', text: 'JSON 파싱 실패 — 파일 형식을 확인하세요.' });
        return;
      }
      const res = await fetch('/api/intel/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: parsed.table, rows: parsed.rows, replace }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ kind: 'error', text: `실패 (HTTP ${res.status}): ${data.error ?? '알 수 없는 오류'}` });
        return;
      }
      setStatus({
        kind: 'ok',
        text: `${data.table}: ${data.upserted}행 반영${data.deleted ? `, ${data.deleted}행 삭제` : ''}`,
      });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : '업로드 실패' });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input
        type="file"
        accept="application/json,.json"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        파일에 없는 행 삭제 (전체 교체)
      </label>
      <button
        type="submit"
        disabled={!file || status.kind === 'busy'}
        className="h-10 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status.kind === 'busy' ? '업로드 중…' : '업로드'}
      </button>
      {status.kind === 'ok' && <p className="text-sm text-emerald-700 dark:text-emerald-400">{status.text}</p>}
      {status.kind === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {status.text}
        </p>
      )}
    </form>
  );
}
