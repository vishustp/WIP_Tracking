// components/reports/process-sheet/types.ts

export type { ProcessSheetFormData } from '@/lib/metallurgy/processSheetSpecHelper';
import type { ProcessSheetFormData } from '@/lib/metallurgy/processSheetSpecHelper';

export interface ProcessSheetFormActions {
  updateField: <K extends keyof ProcessSheetFormData>(field: K, value: ProcessSheetFormData[K]) => void;
  updateFields: (updates: Partial<ProcessSheetFormData>) => void;
}
