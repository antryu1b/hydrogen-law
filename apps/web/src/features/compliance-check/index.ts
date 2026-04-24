// Compliance check feature — H2 implementation
export { runComplianceCheck } from './api/compliance-handler';
export { useComplianceCheck } from './hooks/useComplianceCheck';
export { UploadZone } from './components/UploadZone';
export { ComplianceResults } from './components/ComplianceResults';
export { ViolationCard } from './components/ViolationCard';
export type { ComplianceReport, ComplianceCheck, Violation, Severity } from './types';
