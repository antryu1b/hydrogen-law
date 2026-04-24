import { Badge } from '@/components/ui/badge';
import type { Violation, Severity } from '../types';

const SEVERITY_STYLES: Record<Severity, { badge: string; label: string }> = {
  mandatory: { badge: 'bg-rose-100 text-rose-800 border-rose-200', label: '필수' },
  recommended: { badge: 'bg-amber-100 text-amber-800 border-amber-200', label: '권고' },
  informational: { badge: 'bg-gray-100 text-gray-700 border-gray-200', label: '참고' },
};

interface ViolationCardProps {
  violation: Violation;
}

export function ViolationCard({ violation }: ViolationCardProps) {
  const style = SEVERITY_STYLES[violation.severity] ?? SEVERITY_STYLES.informational;

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
            {style.label}
          </span>
          {violation.article_ref && (
            <Badge variant="outline" className="text-xs font-mono">
              {violation.article_ref.article_id}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground font-mono shrink-0">{violation.rule_id}</span>
      </div>

      <p className="text-sm font-medium">{violation.description}</p>

      {violation.user_context && (
        <blockquote className="border-l-2 border-muted pl-3 text-xs text-muted-foreground italic line-clamp-3">
          {violation.user_context}
        </blockquote>
      )}

      {violation.matched_keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {violation.matched_keywords.map((kw) => (
            <span key={kw} className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
