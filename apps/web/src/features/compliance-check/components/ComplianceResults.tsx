import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { ComplianceReport, Severity } from '../types';
import { ViolationCard } from './ViolationCard';

const RISK_CONFIG = {
  high: { icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200', label: '높음' },
  medium: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: '중간' },
  low: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 border-green-200', label: '낮음' },
};

interface ComplianceResultsProps {
  report: ComplianceReport;
}

export function ComplianceResults({ report }: ComplianceResultsProps) {
  const risk = RISK_CONFIG[report.risk_level] ?? RISK_CONFIG.low;
  const RiskIcon = risk.icon;
  const violations = report.check?.violations ?? [];

  const mandatory = violations.filter((v) => v.severity === 'mandatory');
  const recommended = violations.filter((v) => v.severity === 'recommended');
  const informational = violations.filter((v) => v.severity === 'informational');

  return (
    <div className="space-y-6">
      {/* Risk summary */}
      <Card className={`border-2 ${risk.bg}`}>
        <CardHeader className="pb-3">
          <CardTitle className={`flex items-center gap-2 ${risk.color}`}>
            <RiskIcon className="w-5 h-5" />
            리스크 수준: {risk.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{report.summary}</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-background/60 rounded-lg">
              <p className="text-2xl font-bold text-rose-600">{mandatory.length}</p>
              <p className="text-xs text-muted-foreground">필수 사항</p>
            </div>
            <div className="p-3 bg-background/60 rounded-lg">
              <p className="text-2xl font-bold text-amber-600">{recommended.length}</p>
              <p className="text-xs text-muted-foreground">권고 사항</p>
            </div>
            <div className="p-3 bg-background/60 rounded-lg">
              <p className="text-2xl font-bold text-gray-600">{informational.length}</p>
              <p className="text-xs text-muted-foreground">참고 사항</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Violation list by group */}
      {mandatory.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-rose-700 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            필수 준수 사항 ({mandatory.length}건)
          </h3>
          {mandatory.map((v) => (
            <ViolationCard key={v.rule_id} violation={v} />
          ))}
        </section>
      )}

      {recommended.length > 0 && (
        <>
          {mandatory.length > 0 && <Separator />}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              권고 사항 ({recommended.length}건)
            </h3>
            {recommended.map((v) => (
              <ViolationCard key={v.rule_id} violation={v} />
            ))}
          </section>
        </>
      )}

      {informational.length > 0 && (
        <>
          {(mandatory.length > 0 || recommended.length > 0) && <Separator />}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-600 flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              참고 사항 ({informational.length}건)
            </h3>
            {informational.map((v) => (
              <ViolationCard key={v.rule_id} violation={v} />
            ))}
          </section>
        </>
      )}

      {violations.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Info className="w-4 h-4" />
              적용 가능한 법규 조항이 감지되지 않았습니다.
              사업계획서에 수소 관련 사업 내용이 포함되어 있는지 확인해주세요.
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        생성 시각: {new Date(report.generated_at).toLocaleString('ko-KR')}
        {report.check?.business_type && ` · 사업 유형: ${report.check.business_type}`}
      </p>
    </div>
  );
}
