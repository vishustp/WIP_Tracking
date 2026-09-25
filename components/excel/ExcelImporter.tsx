'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseExcelBuffer,
  parseExcelWorkbook,
  parseExcelDate,
  exportJsonToExcel,
  exportSheetsToExcel,
} from '@/lib/excelUtils';
import { createClient } from '@/lib/supabase/client';
import { usePermissions, getFormAccess } from '@/lib/permissions';
import FormAccessBanner from '@/components/common/FormAccessBanner';
import Link from 'next/link';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  ArrowRight,
  RefreshCw,
  Search,
  FileCheck,
  Lock,
  Download,
  Calendar,
  Layers,
  Sparkles,
  Flame,
  Wrench,
  Thermometer,
  Scissors,
  CheckCheck,
  PackageCheck,
  Building2,
  ChevronRight,
  Info,
} from 'lucide-react';
import { StageCode } from '@/types';

export type WorkCenterImportTab =
  | 'WORK_ORDERS'
  | 'ROLLING'
  | 'HOLLOW_HEAT_TREATMENT'
  | 'DRAW'
  | 'HEAT_TREATMENT'
  | 'BAND_SAW'
  | 'VDI'
  | 'FINISHING';

interface WorkCenterTabConfig {
  key: WorkCenterImportTab;
  label: string;
  shortLabel: string;
  stageCode?: StageCode;
  icon: any;
  color: string;
  description: string;
  requiredFieldsDesc: string;
}

const WORK_CENTER_TABS: WorkCenterTabConfig[] = [
  {
    key: 'WORK_ORDERS',
    label: 'Work Orders Schedule',
    shortLabel: 'Work Orders',
    icon: FileSpreadsheet,
    color: 'from-blue-600 to-indigo-600',
    description: 'Master order book: Customer specs, pipe sizes (OD, WT, L1, L2), ordered quantity, target dates.',
    requiredFieldsDesc: 'W.no, Customer, Specification, OD, WT/WL, L1, L2, Ordered Pcs/Mtr/MT, Bal to Make Mtr',
  },
  {
    key: 'ROLLING',
    label: 'Rolling Mill',
    shortLabel: 'Rolling Mill',
    stageCode: 'ROLLING',
    icon: Flame,
    color: 'from-orange-600 to-amber-600',
    description: 'Hot rolling production entries: Mother hollow sizes, gross output, HTC OK, and rejection logging.',
    requiredFieldsDesc: 'Date, Shift, Work Order No, Heat/Lot No, Mother Hollow OD/WT, L1, L2, Rolled Output Pcs/Mtr, HTC OK Pcs/Mtr',
  },
  {
    key: 'HOLLOW_HEAT_TREATMENT',
    label: 'Hollow Heat Treatment',
    shortLabel: 'Hollow HT',
    stageCode: 'HOLLOW_HEAT_TREATMENT',
    icon: Thermometer,
    color: 'from-rose-600 to-red-600',
    description: 'Hollow annealing & normalizing logs before cold drawing.',
    requiredFieldsDesc: 'Date, Shift, Work Order No, Heat/Lot No, L1, L2, Input Pcs/Mtr, Output Pcs/Mtr, Rejection Pcs/Mtr',
  },
  {
    key: 'DRAW',
    label: 'Cold Draw Bench',
    shortLabel: 'Draw Bench',
    stageCode: 'DRAW',
    icon: Wrench,
    color: 'from-cyan-600 to-teal-600',
    description: 'Plug and mandrel cold drawing production entries, pass outputs, and tag scrap.',
    requiredFieldsDesc: 'Date, Shift, Work Order No, Heat/Lot No, L1, L2, Drawn Output Pcs/Mtr, Rejection Pcs/Mtr',
  },
  {
    key: 'HEAT_TREATMENT',
    label: 'Heat Treatment',
    shortLabel: 'Heat Treatment',
    stageCode: 'HEAT_TREATMENT',
    icon: Thermometer,
    color: 'from-purple-600 to-indigo-600',
    description: 'Final stress relieving, quenching & tempering logs.',
    requiredFieldsDesc: 'Date, Shift, Work Order No, Heat/Lot No, L1, L2, HT Output Pcs/Mtr, Rejection Pcs/Mtr',
  },
  {
    key: 'BAND_SAW',
    label: 'Band Saw Cutting',
    shortLabel: 'Band Saw',
    stageCode: 'BAND_SAW',
    icon: Scissors,
    color: 'from-sky-600 to-blue-600',
    description: 'Mother tube cutting, multi-length splitting, crop ends, and scrap weight in MT.',
    requiredFieldsDesc: 'Date, Shift, Work Order No, L1, L2, Mother Pcs/Mtr, Cut Output Pcs/Mtr, Scrap MT',
  },
  {
    key: 'VDI',
    label: 'VDI QC Inspection',
    shortLabel: 'VDI QC',
    stageCode: 'VDI',
    icon: CheckCheck,
    color: 'from-emerald-600 to-green-600',
    description: 'Visual & Dimensional inspection: Inspected, VDI OK, Salvage/Conditioning, and Rejection logs.',
    requiredFieldsDesc: 'Inspection Date, Work Order No, L1, L2, Inspected Pcs/Mtr, VDI OK Pcs/Mtr, Salvage Pcs, Rejection Pcs, Salvage Reason',
  },
  {
    key: 'FINISHING',
    label: 'Finishing Line',
    shortLabel: 'Finishing',
    stageCode: 'FINISHING',
    icon: PackageCheck,
    color: 'from-violet-600 to-purple-600',
    description: 'Finishing, anti-rust oiling, bundle identification, and dispatch clearance.',
    requiredFieldsDesc: 'Date, Shift, Work Order No, L1, L2, Finished Pcs/Mtr, Bundle No, Rejection Pcs/Mtr',
  },
];

// Helper functions for cleaning and parsing
const clean = (value: unknown): string => String(value ?? '').trim();
const num = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColumn(headers: string[], names: string[]): string | undefined {
  const normalized = headers.map(normalizeHeader);
  for (const name of names) {
    const index = normalized.indexOf(normalizeHeader(name));
    if (index >= 0) return headers[index];
  }
  return undefined;
}

function parseLengthValues(record: any, headers: string[]): { l1: number | null; l2: number | null } {
  const cL1 = findColumn(headers, [
    'L1', 'L 1', 'L-1', 'L_1',
    'Min Length', 'Length Min', 'Length (Min)', 'Min. Length', 'Min Len',
    'L1 (m)', 'L1(m)', 'L1 (Mtr)', 'L1(Mtr)', 'L1 Mtr', 'L1 (mtrs)', 'L1 (mm)', 'L1(mm)',
    'Length From', 'Len From', 'From Length'
  ]);
  const cL2 = findColumn(headers, [
    'L2', 'L 2', 'L-2', 'L_2',
    'Max Length', 'Length Max', 'Length (Max)', 'Max. Length', 'Max Len',
    'L2 (m)', 'L2(m)', 'L2 (Mtr)', 'L2(Mtr)', 'L2 Mtr', 'L2 (mtrs)', 'L2 (mm)', 'L2(mm)',
    'Length To', 'Len To', 'To Length'
  ]);

  let rawL1 = cL1 && record[cL1] !== undefined && record[cL1] !== null && record[cL1] !== '' ? record[cL1] : null;
  let rawL2 = cL2 && record[cL2] !== undefined && record[cL2] !== null && record[cL2] !== '' ? record[cL2] : null;

  if (rawL1 === null && rawL2 === null) {
    const cLen = findColumn(headers, [
      'Length', 'Cut Length', 'Tube Length', 'Pipe Length',
      'Length (m)', 'Length(m)', 'Length (Mtr)', 'Length(Mtr)', 'Length (mtrs)', 'Length (Meter)',
      'Length (mm)', 'Length(mm)',
      'Length Range', 'L1/L2', 'L1-L2', 'L1 - L2', 'Length L1/L2', 'Length (L1-L2)',
      'Cut Length (m)', 'Cut Length (mm)', 'Cut Length (Mtr)', 'Len'
    ]);

    if (cLen && record[cLen] !== undefined && record[cLen] !== null && record[cLen] !== '') {
      const valStr = String(record[cLen]).trim();
      const rangeMatch = valStr.match(/^([0-9.]+)\s*(?:-|–|—|to|\/|~)\s*([0-9.]+)$/i);
      if (rangeMatch) {
        rawL1 = rangeMatch[1];
        rawL2 = rangeMatch[2];
      } else {
        const singleMatch = valStr.match(/^([0-9.]+)/);
        if (singleMatch) {
          rawL1 = singleMatch[1];
          rawL2 = singleMatch[1];
        }
      }
    }
  }

  let l1 = rawL1 != null ? Number(String(rawL1).replace(/,/g, '').trim()) : null;
  let l2 = rawL2 != null ? Number(String(rawL2).replace(/,/g, '').trim()) : null;

  if (l1 !== null && (!Number.isFinite(l1) || l1 <= 0)) l1 = null;
  if (l2 !== null && (!Number.isFinite(l2) || l2 <= 0)) l2 = null;

  if (l1 !== null && l1 > 100) l1 = Number((l1 / 1000).toFixed(3));
  if (l2 !== null && l2 > 100) l2 = Number((l2 / 1000).toFixed(3));

  if (l1 !== null && l2 === null) l2 = l1;
  if (l2 !== null && l1 === null) l1 = l2;

  if (l1 !== null && l2 !== null && l1 > l2) {
    const tmp = l1;
    l1 = l2;
    l2 = tmp;
  }

  return {
    l1: l1 !== null ? l1 : 6.0,
    l2: l2 !== null ? l2 : 6.5,
  };
}

// Sample Datasets for each Work Center
const SAMPLE_DATASETS: Record<WorkCenterImportTab, Record<string, any>[]> = {
  WORK_ORDERS: [
    {
      'W.no': 'WO-2026-101',
      Customer: 'Apex High-Pressure Tubes Ltd',
      'Destination-2': 'Kolkata Port / Ex-Works',
      'PO No': 'PO-APX-8821',
      'PO Date': '2026-08-15',
      'Material Code': 'MAT-A106B-088',
      SPECIFICATION: 'ASTM A106 Gr.B Seamless Boiler Pipe',
      OD: 88.9,
      WL: 7.62,
      L1: 6.0,
      L2: 6.5,
      'Order Pcs': 192,
      'Order Metre': 1200,
      'Order MT': 18.3,
      'Balance Qty (Pcs) FOR BUNDLING': 192,
      'Balance Qty (Mtr) FOR BUNDLING': 1200,
      'Balance Qty (MT) FOR BUNDLING': 18.3,
      'Bal to Make Mtr.': 1200,
      'Target Date': '2026-09-25',
      'Current Status': 'Pending',
    },
    {
      'W.no': 'WO-2026-102',
      Customer: 'Reliance Hydro & Thermal Systems',
      'PO No': 'PO-REL-9942',
      'PO Date': '2026-08-18',
      'Material Code': 'MAT-P11-114',
      SPECIFICATION: 'ASTM A335 P11 Alloy Steel Superheater',
      OD: 114.3,
      WL: 8.56,
      L1: 5.8,
      L2: 6.2,
      'Order Pcs': 142,
      'Order Metre': 850,
      'Order MT': 18.95,
      'Balance Qty (Pcs) FOR BUNDLING': 142,
      'Balance Qty (Mtr) FOR BUNDLING': 850,
      'Balance Qty (MT) FOR BUNDLING': 18.95,
      'Bal to Make Mtr.': 850,
      'Target Date': '2026-09-30',
      'Current Status': 'Pending',
    },
    {
      'W.no': 'WO-2026-103',
      Customer: 'Bharat Petrochemical Equipments',
      'PO No': 'PO-BPE-3301',
      'PO Date': '2026-08-20',
      'Material Code': 'MAT-T22-060',
      SPECIFICATION: 'ASTM A213 T22 Heat Exchanger Tube',
      OD: 60.3,
      WL: 5.54,
      L1: 6.0,
      L2: 6.4,
      'Order Pcs': 242,
      'Order Metre': 1500,
      'Order MT': 11.22,
      'Balance Qty (Pcs) FOR BUNDLING': 242,
      'Balance Qty (Mtr) FOR BUNDLING': 1500,
      'Balance Qty (MT) FOR BUNDLING': 11.22,
      'Bal to Make Mtr.': 1500,
      'Target Date': '2026-10-05',
      'Current Status': 'Pending',
    },
    {
      'W.no': 'WO-2026-104',
      Customer: 'L&T Heavy Engineering Division',
      'PO No': 'PO-LT-5540',
      'PO Date': '2026-08-22',
      'Material Code': 'MAT-API5L-073',
      SPECIFICATION: 'API 5L Gr.B Line Pipe Seamless',
      OD: 73.0,
      WL: 7.01,
      L1: 6.0,
      L2: 6.5,
      'Order Pcs': 320,
      'Order Metre': 2000,
      'Order MT': 22.8,
      'Balance Qty (Pcs) FOR BUNDLING': 320,
      'Balance Qty (Mtr) FOR BUNDLING': 2000,
      'Balance Qty (MT) FOR BUNDLING': 22.8,
      'Bal to Make Mtr.': 2000,
      'Target Date': '2026-10-12',
      'Current Status': 'Pending',
    },
  ],
  ROLLING: [
    {
      Date: '2026-09-17',
      Shift: 'A',
      'Work Order No': 'WO-2026-101',
      'Heat / Lot No': 'H-77492 / L-01',
      'Mother Hollow OD': 108.0,
      'Mother Hollow WT': 9.5,
      L1: 6.0,
      L2: 6.5,
      'Input Pcs': 35,
      'Input Mtr': 210,
      'Rolled Gross Pcs': 34,
      'Rolled Gross Mtr': 204,
      'HTC OK Pcs': 32,
      'HTC OK Mtr': 192,
      'Rejection Pcs': 2,
      'Rejection Mtr': 12,
      'Operator Name': 'R. Sharma',
      Remarks: 'Rolled on Sizing Mill #1, 2 pcs crop end rejection',
    },
    {
      Date: '2026-09-17',
      Shift: 'B',
      'Work Order No': 'WO-2026-102',
      'Heat / Lot No': 'H-88310 / L-02',
      'Mother Hollow OD': 133.0,
      'Mother Hollow WT': 10.5,
      L1: 5.8,
      L2: 6.2,
      'Input Pcs': 25,
      'Input Mtr': 150,
      'Rolled Gross Pcs': 25,
      'Rolled Gross Mtr': 150,
      'HTC OK Pcs': 24,
      'HTC OK Mtr': 144,
      'Rejection Pcs': 1,
      'Rejection Mtr': 6,
      'Operator Name': 'V. Patel',
      Remarks: 'Normal piercing run, alloy P11 grade',
    },
  ],
  HOLLOW_HEAT_TREATMENT: [
    {
      Date: '2026-09-17',
      Shift: 'A',
      'Work Order No': 'WO-2026-101',
      'Heat / Lot No': 'H-77492 / L-01',
      L1: 6.0,
      L2: 6.5,
      'Input Pcs': 32,
      'Input Mtr': 192,
      'Output Pcs': 32,
      'Output Mtr': 192,
      'Rejection Pcs': 0,
      'Rejection Mtr': 0,
      'Operator Name': 'A. Kumar',
      Remarks: 'Full Annealing at 920°C soaking 45min',
    },
    {
      Date: '2026-09-17',
      Shift: 'B',
      'Work Order No': 'WO-2026-102',
      'Heat / Lot No': 'H-88310 / L-02',
      L1: 5.8,
      L2: 6.2,
      'Input Pcs': 24,
      'Input Mtr': 144,
      'Output Pcs': 23,
      'Output Mtr': 138,
      'Rejection Pcs': 1,
      'Rejection Mtr': 6,
      'Operator Name': 'S. Ghosh',
      Remarks: '1 pc scale peeling rejection',
    },
  ],
  DRAW: [
    {
      Date: '2026-09-17',
      Shift: 'A',
      'Work Order No': 'WO-2026-101',
      'Heat / Lot No': 'H-77492 / L-01',
      L1: 6.0,
      L2: 6.5,
      'Input Pcs': 32,
      'Input Mtr': 192,
      'Drawn Output Pcs': 32,
      'Drawn Output Mtr': 208,
      'Rejection Pcs': 0,
      'Rejection Mtr': 0,
      'Operator Name': 'M. Singh',
      Remarks: 'Pass 1 cold drawn on Bench #2 to OD 88.9 x 7.62',
    },
    {
      Date: '2026-09-17',
      Shift: 'B',
      'Work Order No': 'WO-2026-103',
      'Heat / Lot No': 'H-99201 / L-01',
      L1: 6.0,
      L2: 6.4,
      'Input Pcs': 40,
      'Input Mtr': 240,
      'Drawn Output Pcs': 38,
      'Drawn Output Mtr': 235.6,
      'Rejection Pcs': 2,
      'Rejection Mtr': 4.4,
      'Operator Name': 'D. Roy',
      Remarks: '2 pcs tag end chattering',
    },
  ],
  HEAT_TREATMENT: [
    {
      Date: '2026-09-17',
      Shift: 'A',
      'Work Order No': 'WO-2026-101',
      'Heat / Lot No': 'H-77492 / L-01',
      L1: 6.0,
      L2: 6.5,
      'Input Pcs': 32,
      'Input Mtr': 208,
      'HT Output Pcs': 32,
      'HT Output Mtr': 208,
      'Rejection Pcs': 0,
      'Rejection Mtr': 0,
      'Operator Name': 'K. Sen',
      Remarks: 'Stress relief at 650°C furnace batch #12',
    },
    {
      Date: '2026-09-17',
      Shift: 'B',
      'Work Order No': 'WO-2026-102',
      'Heat / Lot No': 'H-88310 / L-02',
      L1: 5.8,
      L2: 6.2,
      'Input Pcs': 23,
      'Input Mtr': 138,
      'HT Output Pcs': 23,
      'HT Output Mtr': 138,
      'Rejection Pcs': 0,
      'Rejection Mtr': 0,
      'Operator Name': 'P. Das',
      Remarks: 'Normalizing 900°C air cooled',
    },
  ],
  BAND_SAW: [
    {
      Date: '2026-09-17',
      Shift: 'A',
      'Work Order No': 'WO-2026-101',
      'Heat / Lot No': 'H-77492 / L-01',
      L1: 6.0,
      L2: 6.5,
      'Mother Pcs': 16,
      'Mother Mtr': 208,
      'Cut Output Pcs': 32,
      'Cut Output Mtr': 200,
      'Scrap MT': 0.12,
      'Operator Name': 'T. Mondal',
      Remarks: 'Cut into 6.25m exact order lengths',
    },
    {
      Date: '2026-09-17',
      Shift: 'B',
      'Work Order No': 'WO-2026-104',
      'Heat / Lot No': 'H-66512 / L-03',
      L1: 5.8,
      L2: 6.2,
      'Mother Pcs': 20,
      'Mother Mtr': 240,
      'Cut Output Pcs': 40,
      'Cut Output Mtr': 232,
      'Scrap MT': 0.18,
      'Operator Name': 'B. Paul',
      Remarks: 'Cut 5.8m fixed length',
    },
  ],
  VDI: [
    {
      'Inspection Date': '2026-09-17',
      'Work Order No': 'WO-2026-101',
      L1: 6.0,
      L2: 6.5,
      'Inspected Pcs': 32,
      'Inspected Mtr': 200,
      'VDI OK Pcs': 28,
      'VDI OK Mtr': 175,
      'VDI Salvage Pcs': 3,
      'VDI Salvage Mtr': 18.75,
      'VDI Rejection Pcs': 1,
      'VDI Rejection Mtr': 6.25,
      'Salvage Reason': 'Surface Dent / Buffing Required',
      'Inspector Name': 'S. Mukherjee',
      Remarks: 'Passed Hydro & UT, 3 pcs marked for buffing salvage',
    },
    {
      'Inspection Date': '2026-09-17',
      'Work Order No': 'WO-2026-102',
      L1: 5.8,
      L2: 6.2,
      'Inspected Pcs': 23,
      'Inspected Mtr': 138,
      'VDI OK Pcs': 21,
      'VDI OK Mtr': 126,
      'VDI Salvage Pcs': 2,
      'VDI Salvage Mtr': 12,
      'VDI Rejection Pcs': 0,
      'VDI Rejection Mtr': 0,
      'Salvage Reason': 'End Burr / Re-chamfering',
      'Inspector Name': 'N. Banerjee',
      Remarks: 'Good dimensional tolerance',
    },
  ],
  FINISHING: [
    {
      Date: '2026-09-17',
      Shift: 'A',
      'Work Order No': 'WO-2026-101',
      'Heat / Lot No': 'H-77492 / L-01',
      L1: 6.0,
      L2: 6.5,
      'Finished Output Pcs': 28,
      'Finished Output Mtr': 175,
      'Rejection Pcs': 0,
      'Rejection Mtr': 0,
      'Bundle No': 'BND-2026-081',
      'Operator Name': 'H. Dutta',
      Remarks: 'Varnish coated, plastic end caps fitted',
    },
    {
      Date: '2026-09-17',
      Shift: 'B',
      'Work Order No': 'WO-2026-102',
      'Heat / Lot No': 'H-88310 / L-02',
      L1: 5.8,
      L2: 6.2,
      'Finished Output Pcs': 21,
      'Finished Output Mtr': 126,
      'Rejection Pcs': 0,
      'Rejection Mtr': 0,
      'Bundle No': 'BND-2026-082',
      'Operator Name': 'S. Ali',
      Remarks: 'Bundled with steel straps and aluminum tags',
    },
  ],
};

export default function ExcelImporter() {
  const { user, isStageAllowed, isAdmin, isSuperUser } = usePermissions();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active Work Center Tab
  const [activeTab, setActiveTab] = useState<WorkCenterImportTab>('WORK_ORDERS');

  // Work Order Cache for fast client-side cross-referencing & auto-completion
  const [knownWos, setKnownWos] = useState<Map<string, any>>(new Map());
  const [loadingWos, setLoadingWos] = useState(false);

  // Stage Queue Cache for checking available WIP feeder balances across all work centers
  const [stageQueueMap, setStageQueueMap] = useState<Map<string, any>>(new Map());
  const [loadingQueue, setLoadingQueue] = useState(false);

  const fetchStageQueue = async (tab: WorkCenterImportTab) => {
    if (tab === 'WORK_ORDERS') {
      setStageQueueMap(new Map());
      return;
    }
    setLoadingQueue(true);
    try {
      const res = await fetch(`/api/production/queue?stage=${tab}&nocache=1`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const map = new Map<string, any>();
        json.data.forEach((row: any) => {
          if (row.work_order_no) {
            map.set(row.work_order_no.toLowerCase().trim(), row);
          }
        });
        setStageQueueMap(map);
      }
    } catch {
      // ignore
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    void fetchStageQueue(activeTab);
  }, [activeTab]);

  // Parse & Import state
  const [rawWorkbookSheets, setRawWorkbookSheets] = useState<{ sheetNames: string[]; sheets: Record<string, any[]> } | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'invalid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Tab Configuration
  const currentTabConfig = useMemo(
    () => WORK_CENTER_TABS.find((t) => t.key === activeTab) || WORK_CENTER_TABS[0],
    [activeTab]
  );

  // Check access for current tab
  const tabFormAccess = useMemo(() => {
    if (activeTab === 'WORK_ORDERS') {
      return getFormAccess(user, 'excel_import');
    }
    return getFormAccess(user, 'production_entry', currentTabConfig.stageCode);
  }, [user, activeTab, currentTabConfig]);

  const canCommit = tabFormAccess.isAllowed;

  // Load existing work orders to resolve sizes, routes, and validation
  const fetchWorkOrders = async () => {
    setLoadingWos(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, work_order_no, customer_name, specification, size_od, size_wt, l1, l2, ordered_qty_pcs, ordered_qty_mtr, balance_qty_pcs, balance_qty_mtr');
      if (!error && data) {
        const map = new Map<string, any>();
        data.forEach((w: any) => map.set(w.work_order_no.toLowerCase().trim(), w));
        setKnownWos(map);
      }
    } catch {
      // ignore
    } finally {
      setLoadingWos(false);
    }
  };

  useEffect(() => {
    void fetchWorkOrders();
  }, []);

  // Compute metrics on parsed rows
  const stats = useMemo(
    () => ({
      total: parsedRows.length,
      valid: parsedRows.filter((r) => !r.error).length,
      invalid: parsedRows.filter((r) => !!r.error).length,
      duplicates: parsedRows.filter((r) => r.duplicate).length,
    }),
    [parsedRows]
  );

  // General Parse Logic for Work Orders or Work Centers
  const parseRecords = useCallback((raw: Record<string, unknown>[], sourceName: string, tab: WorkCenterImportTab = activeTab) => {
    if (!raw.length) {
      setMessage(`Worksheet "${sourceName}" is empty.`);
      setParsedRows([]);
      return;
    }

    const headers = Object.keys(raw[0]);

    if (tab === 'WORK_ORDERS') {
      // --- Work Orders Schedule Parser ---
      const cWO = findColumn(headers, ['W.no', 'W.no.', 'W no', 'Work Order No', 'Work Order Number', 'WO', 'Work Order', 'Order No', 'Order Number']);
      const cCustomer = findColumn(headers, ['Customer', 'Customer Name', 'Client', 'Buyer', 'Party Name', 'Party']);
      const cSpec = findColumn(headers, ['SPECIFICATION', 'Specification', 'Spec', 'Grade', 'Steel Grade', 'Material Spec']);
      const cOD = findColumn(headers, ['OD', 'OD (mm)', 'Size OD', 'Finished OD', 'Outer Diameter', 'Dia']);
      const cWL = findColumn(headers, ['WL', 'Wall', 'Wall Thickness', 'WT', 'WT (mm)', 'Thk', 'Thickness']);
      const cOrderPcs = findColumn(headers, ['Order Pcs', 'Order PCS', 'Order Qty Pcs', 'Ordered Pcs', 'Ordered PCS', 'Pcs']);
      const cOrderMtr = findColumn(headers, ['Order Metre', 'Order Mtr', 'Order MTR', 'Order Meter', 'Order Qty Mtr', 'Ordered Mtr', 'Quantity Mtr', 'Total Mtr']);
      const cOrderMT = findColumn(headers, ['Order MT', 'Order Mt', 'Order Qty MT', 'Ordered MT', 'Weight MT']);
      const cBalPcs = findColumn(headers, ['Balance Qty (Pcs) FOR BUNDLING', 'Balance Qty (Pcs)', 'Balance Qty Pcs', 'Balance Pcs', 'Bal Pcs']);
      const cBalMtr = findColumn(headers, ['Balance Qty (Mtr) FOR BUNDLING', 'Balance Qty (Mtr)', 'Balance Qty Mtr', 'Balance Mtr', 'Bal Mtr']);
      const cBalMT = findColumn(headers, ['Balance Qty (MT) FOR BUNDLING', 'Balance Qty (MT)', 'Balance Qty MT', 'Balance MT', 'Bal MT']);
      const cBalToMakeMtr = findColumn(headers, ['Bal to Make Mtr.', 'Bal to Make Mtr', 'Bal to Make MTR', 'Bal to Make Meter', 'Bal to Make (Mtr)', 'Balance to Make Mtr', 'Pending Mtr']);
      const cStatus = findColumn(headers, ['Current Status', 'Status', 'Order Status']);
      const cTargetDate = findColumn(headers, ['Target Date', 'Delivery Date', 'Target Delivery Date', 'Due Date', 'Promised Date', 'Schedule Date']);
      const cPO = findColumn(headers, ['Purchase Order No', 'Purchase Order Number', 'PO No', 'PO Number', 'P.O. No', 'PO#', 'PO', 'Customer PO']);
      const cPODate = findColumn(headers, ['Purchase Order Date', 'P.O. Date', 'PO Date', 'Order Date']);
      const cMatCode = findColumn(headers, ['Material Code', 'Material No', 'Item Code', 'Item No', 'Mat Code', 'Product Code', 'Part No']);
      const cDestination = findColumn(headers, ['Destination-2', 'Destination 2', 'DESTINATION', 'Destination', 'Destination Port', 'Ship To']);

      if (!cWO) {
        throw new Error(`Column "W.no" or "Work Order No" was not found in the Excel sheet.\n\nDetected columns:\n${headers.join(', ')}`);
      }

      const seen = new Set<string>();
      const parsed = raw.map((record) => {
        const wo = clean(record[cWO]);
        const currentStatus = cStatus ? clean(record[cStatus]) : '';
        const orderMtrVal = cOrderMtr ? num(record[cOrderMtr]) : 0;
        const orderPcsVal = cOrderPcs ? num(record[cOrderPcs]) : 0;
        const orderMTVal = cOrderMT ? num(record[cOrderMT]) : 0;

        const balMtrVal = cBalMtr ? num(record[cBalMtr]) : 0;
        const balPcsVal = cBalPcs ? num(record[cBalPcs]) : 0;
        const balMTVal = cBalMT ? num(record[cBalMT]) : 0;

        const balanceToMakeMtr = cBalToMakeMtr && record[cBalToMakeMtr] !== undefined && record[cBalToMakeMtr] !== ''
          ? num(record[cBalToMakeMtr])
          : balMtrVal > 0 ? balMtrVal : orderMtrVal;

        const odVal = cOD ? num(record[cOD]) || null : null;
        const wlVal = cWL ? num(record[cWL]) || null : null;
        const { l1: l1Val, l2: l2Val } = parseLengthValues(record, headers);
        const targetDateVal = cTargetDate ? parseExcelDate(record[cTargetDate]) : undefined;
        const poNoVal = cPO ? clean(record[cPO]) : undefined;
        const poDateVal = cPODate ? parseExcelDate(record[cPODate]) : undefined;
        const matCodeVal = cMatCode ? clean(record[cMatCode]) : undefined;
        const destinationVal = cDestination ? clean(record[cDestination]) : undefined;

        const row: any = {
          type: 'WORK_ORDERS',
          work_order_no: wo,
          customer_name: cCustomer ? clean(record[cCustomer]) : '',
          specification: cSpec ? clean(record[cSpec]) : '',
          od: odVal,
          wl: wlVal,
          l1: l1Val,
          l2: l2Val,
          ordered_qty_pcs: orderPcsVal,
          ordered_qty_mtr: orderMtrVal,
          ordered_qty_mt: orderMTVal,
          balance_qty_pcs: balPcsVal > 0 ? balPcsVal : orderPcsVal,
          balance_qty_mtr: balMtrVal > 0 ? balMtrVal : balanceToMakeMtr,
          balance_qty_mt: balMTVal > 0 ? balMTVal : orderMTVal,
          current_status: currentStatus || 'Pending',
          balance_to_make_mtr: balanceToMakeMtr,
          target_date: targetDateVal,
          po_no: poNoVal,
          po_date: poDateVal,
          material_code: matCodeVal,
          destination: destinationVal,
        };

        const errors: string[] = [];
        if (!wo) errors.push('Work Order No missing');
        if (row.od === null || row.od <= 0) errors.push('OD missing or invalid');
        if (row.wl === null || row.wl <= 0) errors.push('WT/WL missing or invalid');
        if (row.od && row.wl && row.od <= row.wl) errors.push('OD must be greater than WT');
        if (row.ordered_qty_pcs <= 0 && row.ordered_qty_mtr <= 0 && row.ordered_qty_mt <= 0 && row.balance_to_make_mtr <= 0) {
          errors.push('Order Qty missing');
        }
        if (currentStatus && !['pending', 'in progress', 'open', 'scheduled', 'planned', ''].includes(String(currentStatus).toLowerCase().trim())) {
          errors.push(`Status "${currentStatus}" is not eligible`);
        }
        if (balanceToMakeMtr <= 5 && row.ordered_qty_mtr <= 5) {
          errors.push(`Bal to Make MTR (${balanceToMakeMtr}) ≤ 5`);
        }

        row.duplicate = !!wo && seen.has(wo);
        if (row.duplicate) errors.push('Duplicate WO in file');
        if (wo) seen.add(wo);

        if (errors.length) row.error = errors.join(' • ');
        return row;
      });

      setParsedRows(parsed);
      const eligible = parsed.filter((r) => !r.error).length;
      setMessage(`Parsed ${parsed.length} Work Orders from "${sourceName}". ${eligible} eligible for database sync.`);
    } else if (tab === 'VDI') {
      // --- VDI QC Inspection Parser ---
      const cWO = findColumn(headers, ['Work Order No', 'Work Order', 'W.no', 'W.no.', 'WO', 'Order No']);
      const cDate = findColumn(headers, ['Inspection Date', 'Date', 'Process Date', 'Shift Date']);
      const cInspPcs = findColumn(headers, ['Inspected Pcs', 'Inspected PCS', 'Total Inspected Pcs', 'Pcs Inspected']);
      const cInspMtr = findColumn(headers, ['Inspected Mtr', 'Inspected MTR', 'Inspected Metre', 'Total Inspected Mtr']);
      const cOkPcs = findColumn(headers, ['VDI OK Pcs', 'VDI OK PCS', 'OK Pcs', 'Passed Pcs', 'Accepted Pcs']);
      const cOkMtr = findColumn(headers, ['VDI OK Mtr', 'VDI OK MTR', 'OK Mtr', 'Passed Mtr', 'Accepted Mtr']);
      const cSalPcs = findColumn(headers, ['VDI Salvage Pcs', 'Salvage Pcs', 'Conditioning Pcs', 'Rework Pcs']);
      const cSalMtr = findColumn(headers, ['VDI Salvage Mtr', 'Salvage Mtr', 'Conditioning Mtr', 'Rework Mtr']);
      const cRejPcs = findColumn(headers, ['VDI Rejection Pcs', 'Rejection Pcs', 'Rej Pcs', 'Scrap Pcs']);
      const cRejMtr = findColumn(headers, ['VDI Rejection Mtr', 'Rejection Mtr', 'Rej Mtr', 'Scrap Mtr']);
      const cReason = findColumn(headers, ['Salvage Reason', 'Defect Reason', 'Defect', 'Reason', 'Disposition']);
      const cInspector = findColumn(headers, ['Inspector Name', 'Inspector', 'Inspected By', 'Operator', 'Operator Name']);
      const cRemarks = findColumn(headers, ['Remarks', 'Remark', 'Notes', 'Inspection Notes']);

      if (!cWO) {
        throw new Error(`Column "Work Order No" or "W.no" was not found in the sheet.\n\nDetected columns:\n${headers.join(', ')}`);
      }

      const runningVdiPcs = new Map<string, number>();
      const runningVdiMtr = new Map<string, number>();

      const parsed = raw.map((record) => {
        const wo = clean(record[cWO]);
        const woObj = knownWos.get(wo.toLowerCase());
        const dateVal = cDate ? parseExcelDate(record[cDate]) : new Date().toISOString().slice(0, 10);
        
        const { l1: parsedL1, l2: parsedL2 } = parseLengthValues(record, headers);
        const rowL1 = parsedL1 !== null ? parsedL1 : (woObj?.l1 ?? null);
        const rowL2 = parsedL2 !== null ? parsedL2 : (woObj?.l2 ?? null);
        const avgLen = rowL1 && rowL2 ? (rowL1 + rowL2) / 2 : rowL1 || rowL2 || (woObj?.l1 && woObj?.l2 ? (woObj.l1 + woObj.l2) / 2 : 6.0);

        let inspP = cInspPcs ? num(record[cInspPcs]) : 0;
        let inspM = cInspMtr ? num(record[cInspMtr]) : 0;
        let okP = cOkPcs ? num(record[cOkPcs]) : 0;
        let okM = cOkMtr ? num(record[cOkMtr]) : 0;
        let salP = cSalPcs ? num(record[cSalPcs]) : 0;
        let salM = cSalMtr ? num(record[cSalMtr]) : 0;
        let rejP = cRejPcs ? num(record[cRejPcs]) : 0;
        let rejM = cRejMtr ? num(record[cRejMtr]) : 0;

        // Auto-calculate missing meters if only pieces provided
        if (inspP > 0 && inspM === 0) inspM = Number((inspP * avgLen).toFixed(2));
        if (okP > 0 && okM === 0) okM = Number((okP * avgLen).toFixed(2));
        if (salP > 0 && salM === 0) salM = Number((salP * avgLen).toFixed(2));
        if (rejP > 0 && rejM === 0) rejM = Number((rejP * avgLen).toFixed(2));

        // Auto-calculate missing pieces if only meters provided
        if (inspM > 0 && inspP === 0 && avgLen > 0) inspP = Math.round(inspM / avgLen);
        if (okM > 0 && okP === 0 && avgLen > 0) okP = Math.round(okM / avgLen);
        if (salM > 0 && salP === 0 && avgLen > 0) salP = Math.round(salM / avgLen);
        if (rejM > 0 && rejP === 0 && avgLen > 0) rejP = Math.round(rejM / avgLen);

        // Auto-calculate inspected if ok + sal + rej is provided
        if (inspP === 0 && (okP > 0 || salP > 0 || rejP > 0)) {
          inspP = okP + salP + rejP;
          inspM = Number((inspP * avgLen).toFixed(2));
        }

        const reasonVal = cReason ? clean(record[cReason]) : '';
        const inspectorVal = cInspector ? clean(record[cInspector]) : '';
        const remarksVal = cRemarks ? clean(record[cRemarks]) : '';

        const errors: string[] = [];
        if (!wo) errors.push('Work Order No missing');
        if (knownWos.size > 0 && !woObj) errors.push(`WO "${wo}" not found in database`);
        if (!dateVal) errors.push('Inspection Date missing');
        if (inspP <= 0 && inspM <= 0) errors.push('Inspected quantity must be > 0');
        if (inspP > 0 && okP + salP + rejP !== inspP) {
          errors.push(`Pieces mismatch: ${inspP} Inspected ≠ ${okP} OK + ${salP} Salvage + ${rejP} Rej`);
        }

        // Feeder validation for VDI
        let allowedPcs = 0;
        let allowedMtr = 0;
        let feederLabel = 'Band Saw / Heat Treatment Net OK';
        if (stageQueueMap.size > 0 && wo) {
          const qRow = stageQueueMap.get(wo.toLowerCase());
          if (!qRow) {
            errors.push('No available feeder WIP for VDI Inspection. Preceding stage output not available.');
          } else {
            allowedPcs = Number(qRow.max_allowed_pcs ?? qRow.balance_to_make_pcs ?? 0);
            allowedMtr = Number(qRow.max_allowed_mtr ?? qRow.balance_to_make_mtr ?? 0);
            feederLabel = qRow.feeder_source_label || feederLabel;

            const cumPcs = (runningVdiPcs.get(wo.toLowerCase()) || 0) + inspP;
            const cumMtr = (runningVdiMtr.get(wo.toLowerCase()) || 0) + inspM;
            runningVdiPcs.set(wo.toLowerCase(), cumPcs);
            runningVdiMtr.set(wo.toLowerCase(), cumMtr);

            if (allowedPcs <= 0 && allowedMtr <= 0) {
              errors.push(`No available feeder WIP for VDI Inspection. Please record and pass ${feederLabel} first.`);
            } else if (inspP > 0 && allowedPcs > 0 && cumPcs > allowedPcs) {
              errors.push(`VDI Inspected (${cumPcs} PCS cumulative) exceeds available ${feederLabel} balance (${allowedPcs} PCS).`);
            } else if (inspP <= 0 && cumMtr > allowedMtr + 0.5) {
              errors.push(`VDI Inspected (${cumMtr.toFixed(2)} MTR cumulative) exceeds available ${feederLabel} balance (${allowedMtr.toFixed(2)} MTR).`);
            }
          }
        }

        const row = {
          type: 'VDI',
          work_order_no: wo,
          customer_name: woObj?.customer_name || '',
          specification: woObj?.specification || '',
          l1: rowL1,
          l2: rowL2,
          input_l1: rowL1,
          input_l2: rowL2,
          avg_length: Number(avgLen.toFixed(3)),
          process_date: dateVal,
          inspected_pcs: inspP,
          inspected_mtr: inspM,
          vdi_ok_pcs: okP,
          vdi_ok_mtr: okM,
          vdi_salvage_pcs: salP,
          vdi_salvage_mtr: salM,
          vdi_rejection_pcs: rejP,
          vdi_rejection_mtr: rejM,
          salvage_reason: reasonVal,
          operator_name: inspectorVal,
          remarks: remarksVal,
          error: errors.length ? errors.join(' • ') : undefined,
        };
        return row;
      });

      setParsedRows(parsed);
      const eligible = parsed.filter((r) => !r.error).length;
      setMessage(`Parsed ${parsed.length} VDI QC Inspection rows from "${sourceName}". ${eligible} eligible for database recording.`);
    } else {
      // --- Standard Work Center Parser (ROLLING, HTC, DRAW, HT, BAND_SAW, FINISHING) ---
      const cWO = findColumn(headers, [
        'Work Order No', 'Work Order', 'W.no', 'W.no.', 'WO', 'Order No', 'Order Number',
        'WORK ORDER NO.', 'WORK ORDER NO', 'W.NO.', 'W.NO', 'WO NO', 'WO NO.', 'W_NO'
      ]);
      const cDate = findColumn(headers, [
        'Date', 'Rolling Date', 'ROLLING DATE', 'Grinding Date', 'GRINDING DATE',
        'Process Date', 'Shift Date', 'Production Date', 'Log Date', 'Entry Date', 'Mfg Date', 'Inspection Date'
      ]);
      const cShift = findColumn(headers, ['Shift', 'Shift Name', 'Shift (A/B/C)']);
      const cHeatLot = findColumn(headers, [
        'Heat / Lot No', 'Heat/Lot No', 'Heat Lot No', 'Heat No', 'HEAT NO.', 'HEAT NO',
        'Lot No', 'LOT NO.', 'LOT NO', 'B.NO.', 'B.NO', 'H.NO.', 'H.NO',
        'Heat / Lot', 'Heat', 'Lot', 'Batch No', 'HEAT'
      ]);
      
      const cInPcs = findColumn(headers, ['Input Pcs', 'Input PCS', 'Mother Pcs', 'In Pcs']);
      const cInMtr = findColumn(headers, ['Input Mtr', 'Input MTR', 'Mother Mtr', 'In Mtr', 'Input Metre']);
      
      const cOutPcs = findColumn(headers, [
        'Rolled Gross Pcs', 'Rolled Gross', 'ROLLED GROSS', 'Gross Pcs', 'Gross', 'Rolled Gross (Pcs)',
        'Output Pcs', 'Output PCS', 'OUTPUT PCS', 'OK', 'OK Pcs', 'Drawn Output Pcs', 'HT Output Pcs',
        'Cut Output Pcs', 'Finished Output Pcs', 'Produced Pcs', 'Prod Pcs', 'Pcs', 'PCS'
      ]);
      const cOutMtr = findColumn(headers, [
        'Rolled Gross Mtr', 'ROLLED GROSS MTR', 'Rolled Gross (Mtr)', 'Gross Mtr',
        'Output Mtr', 'Output MTR', 'OUTPUT MTR', 'OK Mtr', 'Drawn Output Mtr', 'HT Output Mtr',
        'Cut Output Mtr', 'Finished Output Mtr', 'Produced Mtr', 'Prod Mtr', 'Mtr', 'MTR', 'Metre'
      ]);

      const cHtcPcs = findColumn(headers, [
        'HTC OK PCS', 'HTC OK Pcs', 'HTC OK Pcs.', 'HTC OK', 'HTC Pcs',
        'Hollow OK Pcs', 'Rolling OK Pcs', 'HTC_OK_PCS', 'HTC_OK'
      ]);
      const cHtcMtr = findColumn(headers, [
        'HTC OK MTR', 'HTC OK Mtr', 'HTC OK Mtr.', 'HTC Mtr',
        'Hollow OK Mtr', 'Rolling OK Mtr', 'HTC_OK_MTR'
      ]);

      const cRejPcs = findColumn(headers, [
        'Reject', 'REJECT', 'Rejection', 'REJECTION', 'Rejection Pcs', 'Rejection PCS',
        'Reject Pcs', 'REJECT PCS', 'Rej Pcs', 'Scrap Pcs', 'Loss Pcs', 'Rej'
      ]);
      const cRejMtr = findColumn(headers, [
        'Reject Mtr', 'REJECT MTR', 'Rejection Mtr', 'Rejection MTR', 'Rej Mtr', 'Scrap Mtr', 'Loss Mtr'
      ]);
      const cScrapMT = findColumn(headers, [
        'TOTAL MT', 'Total MT', 'Total Mt', 'Scrap MT', 'Scrap Mt', 'Scrap Weight MT', 'Crop Scrap MT', 'MT', 'Weight MT'
      ]);
      const cBundle = findColumn(headers, ['Bundle No', 'Bundle No.', 'Bundle Number', 'Bundle #', 'Lot Bundle', 'B.NO.', 'B.NO']);
      const cOperator = findColumn(headers, ['Operator Name', 'Operator', 'Operated By', 'Supervisor', 'Shift Incharge']);
      const cRemarks = findColumn(headers, ['Remarks', 'Remark', 'Notes', 'Production Notes', 'Reason']);
      const cDefectReason = findColumn(headers, ['Defect Reason', 'DEFECT REASON', 'Defect', 'Reason', 'Defect Details', 'Salvage Reason']);
      const cSalvage = findColumn(headers, ['SALVAGE', 'Salvage', 'Salvage Pcs', 'Conditioning Pcs', 'REWORK OK', 'Rework OK']);

      if (!cWO) {
        throw new Error(`Column "Work Order No" or "W.no" was not found in the sheet.\n\nDetected columns:\n${headers.join(', ')}`);
      }

      const runningStdPcs = new Map<string, number>();
      const runningStdMtr = new Map<string, number>();

      const parsed = raw.map((record) => {
        const wo = clean(record[cWO]);
        const woObj = knownWos.get(wo.toLowerCase());
        const dateVal = cDate ? parseExcelDate(record[cDate]) : new Date().toISOString().slice(0, 10);
        const shiftVal = cShift ? clean(record[cShift]) : 'A';
        const heatLotVal = cHeatLot ? clean(record[cHeatLot]) : '';
        
        const { l1: parsedL1, l2: parsedL2 } = parseLengthValues(record, headers);
        const rowL1 = parsedL1 !== null ? parsedL1 : (woObj?.l1 ?? null);
        const rowL2 = parsedL2 !== null ? parsedL2 : (woObj?.l2 ?? null);
        const avgLen = rowL1 && rowL2 ? (rowL1 + rowL2) / 2 : rowL1 || rowL2 || (woObj?.l1 && woObj?.l2 ? (woObj.l1 + woObj.l2) / 2 : 6.0);

        let inPcs = cInPcs ? num(record[cInPcs]) : 0;
        let inMtr = cInMtr ? num(record[cInMtr]) : 0;
        let outPcs = cOutPcs ? num(record[cOutPcs]) : 0;
        let outMtr = cOutMtr ? num(record[cOutMtr]) : 0;
        let htcPcs = cHtcPcs ? num(record[cHtcPcs]) : 0;
        let htcMtr = cHtcMtr ? num(record[cHtcMtr]) : 0;
        let rejPcs = cRejPcs ? num(record[cRejPcs]) : 0;
        let rejMtr = cRejMtr ? num(record[cRejMtr]) : 0;
        const scrapMT = cScrapMT ? num(record[cScrapMT]) : 0;
        const bundleVal = cBundle ? clean(record[cBundle]) : '';
        const operatorVal = cOperator ? clean(record[cOperator]) : '';
        const remarksVal = cRemarks ? clean(record[cRemarks]) : '';
        const defectReasonVal = cDefectReason ? clean(record[cDefectReason]) : '';
        const salvageVal = cSalvage ? clean(record[cSalvage]) : '';

        // If HTC OK is given but OutPcs/Mtr was not explicitly separated, derive Gross Output = HTC OK + Rejection
        if (htcPcs > 0 && outPcs === 0) {
          outPcs = htcPcs + rejPcs;
        }
        if (htcMtr > 0 && outMtr === 0) {
          outMtr = Number((htcMtr + rejMtr).toFixed(2));
        }

        // If OutPcs/Mtr is not supplied, but Input Pcs/Mtr is supplied (common in Heat Treatment / Furnace logs)
        if (outPcs === 0 && outMtr === 0 && (inPcs > 0 || inMtr > 0)) {
          if (inPcs > 0) outPcs = Math.max(0, inPcs - rejPcs);
          if (inMtr > 0) outMtr = Math.max(0, Number((inMtr - rejMtr).toFixed(2)));
        }

        // Auto calculate meters from pieces if pieces given
        if (outPcs > 0 && outMtr === 0) outMtr = Number((outPcs * avgLen).toFixed(2));
        if (inPcs > 0 && inMtr === 0) inMtr = Number((inPcs * avgLen).toFixed(2));
        if (htcPcs > 0 && htcMtr === 0) htcMtr = Number((htcPcs * avgLen).toFixed(2));
        if (rejPcs > 0 && rejMtr === 0) rejMtr = Number((rejPcs * avgLen).toFixed(2));

        // Auto calculate pieces from meters if only meters given
        if (outMtr > 0 && outPcs === 0 && avgLen > 0) outPcs = Math.round(outMtr / avgLen);
        if (inMtr > 0 && inPcs === 0 && avgLen > 0) inPcs = Math.round(inMtr / avgLen);
        if (htcMtr > 0 && htcPcs === 0 && avgLen > 0) htcPcs = Math.round(htcMtr / avgLen);
        if (rejMtr > 0 && rejPcs === 0 && avgLen > 0) rejPcs = Math.round(rejMtr / avgLen);

        // Rolling Specific: HTC OK defaults to outPcs - rejPcs if not explicitly supplied
        if (tab === 'ROLLING') {
          if (htcPcs === 0 && outPcs > 0) htcPcs = Math.max(0, outPcs - rejPcs);
          if (htcMtr === 0 && outMtr > 0) htcMtr = Math.max(0, Number((outMtr - rejMtr).toFixed(2)));
        }

        const effectiveOutPcs = outPcs || htcPcs || (avgLen > 0 && outMtr > 0 ? Math.round(outMtr / avgLen) : 0);

        const errors: string[] = [];
        if (!wo) errors.push('Work Order No missing');
        if (knownWos.size > 0 && !woObj) errors.push(`WO "${wo}" not found in database`);
        if (!dateVal) errors.push('Date missing or invalid');
        if (outPcs <= 0 && outMtr <= 0 && inPcs <= 0 && inMtr <= 0 && htcPcs <= 0 && htcMtr <= 0) {
          errors.push('Production Output/HTC OK quantity missing');
        }
        if (tab === 'ROLLING' && (outPcs > 0 || outMtr > 0 || htcPcs > 0 || htcMtr > 0)) {
          if (htcPcs <= 0 && htcMtr <= 0) {
            errors.push('Rolling requires HTC OK Pcs or Mtr > 0');
          }
        }

        // Feeder validation across all work centers
        let allowedPcs = 0;
        let allowedMtr = 0;
        let feederLabel = 'Preceding Stage';
        if (stageQueueMap.size > 0 && wo) {
          const qRow = stageQueueMap.get(wo.toLowerCase());
          if (!qRow) {
            errors.push(`No available feeder WIP for ${currentTabConfig.shortLabel}. Preceding stage output not available.`);
          } else {
            allowedPcs = Number(qRow.max_allowed_pcs ?? qRow.balance_to_make_pcs ?? 0);
            allowedMtr = Number(qRow.max_allowed_mtr ?? qRow.balance_to_make_mtr ?? 0);
            feederLabel = qRow.feeder_source_label || feederLabel;

            const cumPcs = (runningStdPcs.get(wo.toLowerCase()) || 0) + effectiveOutPcs;
            const cumMtr = (runningStdMtr.get(wo.toLowerCase()) || 0) + outMtr;
            runningStdPcs.set(wo.toLowerCase(), cumPcs);
            runningStdMtr.set(wo.toLowerCase(), cumMtr);

            if (allowedPcs <= 0 && allowedMtr <= 0) {
              errors.push(`No available feeder WIP for ${currentTabConfig.shortLabel}. Please record and pass ${feederLabel} first.`);
            } else if (effectiveOutPcs > 0 && allowedPcs > 0 && cumPcs > allowedPcs) {
              errors.push(`${currentTabConfig.shortLabel} (${cumPcs} PCS cumulative) exceeds available ${feederLabel} balance (${allowedPcs} PCS).`);
            } else if (effectiveOutPcs <= 0 && cumMtr > allowedMtr + 0.5) {
              errors.push(`${currentTabConfig.shortLabel} (${cumMtr.toFixed(2)} MTR cumulative) exceeds available ${feederLabel} balance (${allowedMtr.toFixed(2)} MTR).`);
            }
          }
        }

        let finalRemarks = remarksVal;
        if (defectReasonVal) {
          finalRemarks = finalRemarks ? `${finalRemarks} [Defect: ${defectReasonVal}]` : `Defect: ${defectReasonVal}`;
        }
        if (salvageVal && Number(salvageVal) > 0) {
          finalRemarks = finalRemarks ? `${finalRemarks} [Salvage: ${salvageVal}]` : `Salvage: ${salvageVal}`;
        }
        if (bundleVal) {
          finalRemarks = finalRemarks ? `${finalRemarks} [Bundle: ${bundleVal}]` : `Bundle: ${bundleVal}`;
        }
        if (scrapMT > 0) {
          finalRemarks = finalRemarks ? `${finalRemarks} [MT: ${scrapMT}]` : `MT: ${scrapMT}`;
        }

        const row = {
          type: tab,
          work_order_no: wo,
          customer_name: woObj?.customer_name || '',
          specification: woObj?.specification || '',
          l1: rowL1,
          l2: rowL2,
          input_l1: rowL1,
          input_l2: rowL2,
          avg_length: Number(avgLen.toFixed(3)),
          process_date: dateVal,
          shift: shiftVal,
          heat_lot_no: heatLotVal,
          input_pcs: inPcs,
          input_mtr: inMtr,
          output_pcs: outPcs,
          output_mtr: outMtr,
          htc_ok_pcs: htcPcs,
          htc_ok_mtr: htcMtr,
          rejection_pcs: rejPcs,
          rejection_mtr: rejMtr,
          scrap_mt: scrapMT,
          bundle_no: bundleVal,
          operator_name: operatorVal,
          remarks: finalRemarks,
          error: errors.length ? errors.join(' • ') : undefined,
        };
        return row;
      });

      setParsedRows(parsed);
      const eligible = parsed.filter((r) => !r.error).length;
      setMessage(`Parsed ${parsed.length} rows for ${currentTabConfig.label} from "${sourceName}". ${eligible} eligible for recording.`);
    }
  }, [activeTab, stageQueueMap, currentTabConfig.label, currentTabConfig.shortLabel, knownWos]);

  // Process File Upload (single or multi-sheet)
  async function parseFile(file: File) {
    setParsing(true);
    setMessage('');
    setImportSuccessCount(null);
    setParsedRows([]);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbookData = await parseExcelWorkbook<Record<string, unknown>>(buffer);
      setRawWorkbookSheets(workbookData);

      // Auto-detect matching sheet or pick first sheet
      let targetSheet = workbookData.sheetNames[0];
      const match = workbookData.sheetNames.find((s) => {
        const norm = s.toUpperCase().replace(/\s+/g, '_');
        return norm.includes(activeTab) || (activeTab === 'WORK_ORDERS' && norm.includes('ORDER'));
      });
      if (match) targetSheet = match;

      setSelectedSheetName(targetSheet);
      const records = workbookData.sheets[targetSheet] || [];
      parseRecords(records, targetSheet, activeTab);
    } catch (error) {
      setParsedRows([]);
      setMessage(error instanceof Error ? error.message : 'Unable to read Excel file.');
    } finally {
      setParsing(false);
    }
  }

  // Load Sample Data for Active Tab
  const loadSampleData = () => {
    setFileName(`Sample_${activeTab}_Data.xlsx`);
    setImportSuccessCount(null);
    const sample = SAMPLE_DATASETS[activeTab] || [];
    parseRecords(sample, `${currentTabConfig.label} Sample`, activeTab);
  };

  // Download Active Tab Template (.xlsx)
  const downloadTabTemplate = async () => {
    const sample = SAMPLE_DATASETS[activeTab] || [];
    const fileName = `Seamless_Pipe_${currentTabConfig.key}_Template.xlsx`;
    await exportJsonToExcel(sample, currentTabConfig.shortLabel, fileName);
  };

  // Download Complete Multi-Work-Center Workbook (.xlsx with all 8 sheets)
  const downloadAllSheetsTemplate = async () => {
    const sheets = WORK_CENTER_TABS.map((tab) => ({
      name: tab.shortLabel,
      data: SAMPLE_DATASETS[tab.key] || [],
    }));
    await exportSheetsToExcel(sheets, 'Seamless_Pipe_Manufacturing_All_Work_Centers_Template.xlsx');
  };

  // Switch Work Center Tab
  const handleTabChange = (newTab: WorkCenterImportTab) => {
    setActiveTab(newTab);
    setImportSuccessCount(null);
    setMessage('');
    // If raw sheets already loaded, re-parse with active tab
    if (rawWorkbookSheets && selectedSheetName) {
      const records = rawWorkbookSheets.sheets[selectedSheetName] || [];
      parseRecords(records, selectedSheetName, newTab);
    } else {
      setParsedRows([]);
    }
  };

  // Handle Sheet Change when multi-sheet file loaded
  const handleSheetChange = (sheetName: string) => {
    setSelectedSheetName(sheetName);
    if (rawWorkbookSheets) {
      const records = rawWorkbookSheets.sheets[sheetName] || [];
      parseRecords(records, sheetName, activeTab);
    }
  };

  // Automatically re-evaluate feeder balances when queue data is fetched
  useEffect(() => {
    if (rawWorkbookSheets && selectedSheetName && activeTab !== 'WORK_ORDERS') {
      const records = rawWorkbookSheets.sheets[selectedSheetName] || [];
      parseRecords(records, selectedSheetName, activeTab);
    }
  }, [stageQueueMap, activeTab, parseRecords, rawWorkbookSheets, selectedSheetName]);

  // Clear Import Form
  function clearImport() {
    setParsedRows([]);
    setRawWorkbookSheets(null);
    setSelectedSheetName('');
    setMessage('');
    setImportSuccessCount(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Batch Import Execution
  async function executeImport() {
    const validRows = parsedRows.filter((row) => !row.error);
    if (!validRows.length) {
      setMessage('There are no rows meeting the import criteria.');
      return;
    }

    setLoading(true);
    setMessage(`Importing ${validRows.length} valid rows into ${currentTabConfig.label}…`);

    try {
      if (activeTab === 'WORK_ORDERS') {
        // Import Work Orders via direct RPC / Supabase batch
        const supabase = createClient();
        const batchPayload = validRows.map((r) => ({
          work_order_no: r.work_order_no,
          customer_name: r.customer_name,
          specification: r.specification,
          od: r.od,
          wl: r.wl,
          l1: r.l1,
          l2: r.l2,
          ordered_qty_pcs: r.ordered_qty_pcs,
          ordered_qty_mtr: r.ordered_qty_mtr,
          ordered_qty_mt: r.ordered_qty_mt,
          balance_qty_pcs: r.balance_qty_pcs,
          balance_qty_mtr: r.balance_qty_mtr,
          balance_qty_mt: r.balance_qty_mt,
          balance_to_make_mtr: r.balance_to_make_mtr,
          target_date: r.target_date,
          current_status: r.current_status,
          po_no: r.po_no || null,
          po_date: r.po_date || null,
          material_code: r.material_code || null,
          destination: r.destination || null,
        }));

        let imported = 0;
        let failed = 0;
        const errors: string[] = [];

        try {
          const { data, error } = await supabase.rpc('import_work_orders_batch', {
            p_rows: batchPayload,
          });
          if (!error && data !== undefined) {
            imported = Number(data) || validRows.length;
          } else {
            // Fallback chunked import
            const chunkSize = 10;
            for (let i = 0; i < validRows.length; i += chunkSize) {
              const chunk = validRows.slice(i, i + chunkSize);
              await Promise.all(
                chunk.map(async (row) => {
                  const { error: rpcErr } = await supabase.rpc('import_work_order', {
                    p_work_order_no: row.work_order_no,
                    p_customer_name: row.customer_name,
                    p_specification: row.specification,
                    p_od: row.od,
                    p_wl: row.wl,
                    p_l1: row.l1,
                    p_l2: row.l2,
                    p_ordered_qty_pcs: row.ordered_qty_pcs,
                    p_ordered_qty_mtr: row.ordered_qty_mtr,
                    p_ordered_qty_mt: row.ordered_qty_mt,
                    p_balance_qty_pcs: row.balance_qty_pcs,
                    p_balance_qty_mtr: row.balance_qty_mtr,
                    p_balance_qty_mt: row.balance_qty_mt,
                  });
                  if (rpcErr) {
                    failed++;
                    if (errors.length < 5) errors.push(`${row.work_order_no}: ${rpcErr.message}`);
                  } else {
                    imported++;
                  }
                })
              );
            }
          }
        } catch (e: any) {
          throw e;
        }

        // Explicit updates for extra fields
        const updateChunkSize = 25;
        for (let i = 0; i < validRows.length; i += updateChunkSize) {
          const chunk = validRows.slice(i, i + updateChunkSize);
          await Promise.all(
            chunk.map(async (row) => {
              const updateObj: Record<string, any> = {
                l1: row.l1,
                l2: row.l2,
                ordered_qty_pcs: row.ordered_qty_pcs,
                ordered_qty_mtr: row.ordered_qty_mtr,
                ordered_qty_mt: row.ordered_qty_mt,
                balance_qty_pcs: row.balance_qty_pcs,
                balance_qty_mtr: row.balance_qty_mtr,
                balance_qty_mt: row.balance_qty_mt,
              };
              if (row.po_no) updateObj.po_no = row.po_no;
              if (row.po_date) updateObj.po_date = row.po_date;
              if (row.material_code) updateObj.material_code = row.material_code;
              if (row.destination) updateObj.destination = row.destination;

              const { error: updErr } = await supabase
                .from('work_orders')
                .update(updateObj)
                .eq('work_order_no', row.work_order_no);

              if (updErr && updateObj.destination) {
                delete updateObj.destination;
                await supabase.from('work_orders').update(updateObj).eq('work_order_no', row.work_order_no);
              }
            })
          );
        }

        setImportSuccessCount(imported);
        setMessage(
          failed
            ? `Import summary: ${imported} imported, ${failed} rejected. ${errors.join(' | ')}`
            : `✓ Success: All ${imported} Work Orders synchronized successfully into the database.`
        );
        void fetchWorkOrders();
      } else {
        // Work Center Batch Import via API
        const res = await fetch('/api/excel-import/work-center', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            work_center: activeTab,
            rows: validRows,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Failed to import into ${currentTabConfig.label}.`);
        }

        setImportSuccessCount(data.importedCount);
        const dupNotice = data.skippedDuplicatesCount > 0 ? ` (${data.skippedDuplicatesCount} already exist in database and were skipped)` : '';
        if (data.importedCount === 0 && data.skippedDuplicatesCount > 0) {
          setMessage(
            `ℹ 0 New Records Added: All ${data.skippedDuplicatesCount} rows are already recorded in the database. Duplicate protection prevented double entries.`
          );
        } else if (data.errors && data.errors.length > 0) {
          setMessage(
            `⚠ Recorded ${data.importedCount} of ${data.totalRows} rows${dupNotice}. Some rows had issues (${data.errors.length}):\n${data.errors.slice(0, 3).join('; ')}`
          );
        } else {
          setMessage(
            `✓ Success: ${data.importedCount} production entries recorded into ${currentTabConfig.label}${dupNotice}. WIP ledgers and tracking updated.`
          );
        }
      }
    } catch (error: any) {
      console.error('Import execution error:', error);
      setMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  // Filter & Search
  const displayedRows = useMemo(() => {
    return parsedRows.filter((r) => {
      if (filterMode === 'valid' && r.error) return false;
      if (filterMode === 'invalid' && !r.error) return false;
      if (
        searchQuery &&
        ![r.work_order_no, r.customer_name, r.specification, r.heat_lot_no, r.operator_name, r.remarks, r.error]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [parsedRows, filterMode, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header & Global Quick Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Multi-Work Center Excel Import
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Seamlessly upload, validate, and synchronize production entries, shift logs, and schedules for each factory station.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTabTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
          >
            <Download className="h-4 w-4 text-slate-600" /> Template: {currentTabConfig.shortLabel} (.xlsx)
          </button>
          <button
            type="button"
            onClick={downloadAllSheetsTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-xs hover:bg-slate-100 transition"
          >
            <Building2 className="h-4 w-4 text-indigo-600" /> Master Workbook (All 8 Stations)
          </button>
        </div>
      </div>

      {/* Work Center Selector Tab Bar */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-2 shadow-xs">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 py-1 mb-1.5">
          Select Target Work Center Station
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8">
          {WORK_CENTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`flex flex-col items-center justify-center rounded-lg p-2.5 text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10'
                    : 'bg-slate-50/70 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 mb-1 ${isSelected ? 'text-indigo-300' : 'text-slate-500'}`} />
                <span className="text-center truncate w-full">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Station Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${currentTabConfig.color} text-white shadow-xs`}>
            {(() => {
              const Icon = currentTabConfig.icon;
              return <Icon className="h-5 w-5" />;
            })()}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{currentTabConfig.label}</h2>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                Stage Code: {currentTabConfig.stageCode || 'MASTER_SCHEDULE'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{currentTabConfig.description}</p>
            <p className="text-[11px] text-slate-400 mt-1">
              <span className="font-semibold text-slate-600">Recognized columns:</span> {currentTabConfig.requiredFieldsDesc}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadSampleData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Load Sample Data
          </button>
        </div>
      </div>

      {/* Permission Banner */}
      <FormAccessBanner access={tabFormAccess} />

      {/* Multi-Sheet Selector (when uploaded file contains multiple sheets) */}
      {rawWorkbookSheets && rawWorkbookSheets.sheetNames.length > 1 && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-sm">
          <div className="flex items-center gap-2 text-indigo-900 font-medium">
            <Info className="h-4 w-4 text-indigo-600" />
            <span>Multiple worksheets detected in Excel file ({rawWorkbookSheets.sheetNames.length} sheets).</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Select Sheet:</label>
            <select
              value={selectedSheetName}
              onChange={(e) => handleSheetChange(e.target.value)}
              className="h-8 rounded-lg border border-indigo-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
            >
              {rawWorkbookSheets.sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name} ({rawWorkbookSheets.sheets[name]?.length || 0} rows)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Drag-and-Drop Upload Zone */}
      <div
        className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-slate-400 hover:bg-slate-50/50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) void parseFile(file);
        }}
      >
        <div className="mx-auto flex max-w-md flex-col items-center space-y-2.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">
              Drop {currentTabConfig.label} Excel (.xlsx, .xls, .csv)
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Drag file here or click Browse. We automatically validate work orders, dates, weights, and stage rules.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void parseFile(file);
            }}
          />

          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="min-h-[2.75rem] rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 active:scale-[0.98] transition disabled:opacity-50"
            >
              {parsing ? 'Parsing Sheet…' : 'Browse File'}
            </button>
            <button
              type="button"
              onClick={loadSampleData}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Use Sample Data
            </button>
          </div>

          {fileName && (
            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 mt-1">
              <FileCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>{fileName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Post-Import Success / Duplicate Notice Banner */}
      {importSuccessCount !== null && (
        <div
          className={`rounded-xl border p-4 text-sm space-y-3 shadow-xs ${
            importSuccessCount > 0
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div
            className={`flex items-center gap-2 font-bold text-sm ${
              importSuccessCount > 0 ? 'text-emerald-900' : 'text-amber-900'
            }`}
          >
            {importSuccessCount > 0 ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <Info className="h-5 w-5 text-amber-600 shrink-0" />
            )}
            <span>
              {importSuccessCount > 0
                ? `${importSuccessCount} Records Successfully Recorded for ${currentTabConfig.label}!`
                : `0 New Records Recorded for ${currentTabConfig.label}`}
            </span>
          </div>
          <p
            className={`text-xs ${
              importSuccessCount > 0 ? 'text-emerald-800' : 'text-amber-800'
            }`}
          >
            {importSuccessCount > 0
              ? 'The data has been committed to the database. WIP ledgers, route stage balances, and production histories are fully synchronized.'
              : 'All candidate rows were already recorded in the database or met duplicate safeguards. No duplicate logs were created.'}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {activeTab === 'WORK_ORDERS' ? (
              <>
                <Link
                  href="/work-orders"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 shadow-xs"
                >
                  <Layers className="h-3.5 w-3.5" /> View Work Orders Directory
                </Link>
                <Link
                  href="/rolling-plans"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 shadow-xs"
                >
                  <Calendar className="h-3.5 w-3.5 text-blue-600" /> Issue Rolling Plan
                </Link>
              </>
            ) : activeTab === 'VDI' ? (
              <>
                <Link
                  href="/vdi"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 shadow-xs"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Open VDI QC Inspection Station
                </Link>
                <Link
                  href="/reports/work-order-tracking"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 shadow-xs"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-600" /> View Work Order Tracking Sheet
                </Link>
              </>
            ) : activeTab === 'BAND_SAW' ? (
              <>
                <Link
                  href="/band-saw"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 shadow-xs"
                >
                  <Scissors className="h-3.5 w-3.5" /> Open Band Saw Station
                </Link>
                <Link
                  href="/production"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 shadow-xs"
                >
                  <Layers className="h-3.5 w-3.5 text-blue-600" /> Production Ledger
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/production"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 shadow-xs"
                >
                  <Layers className="h-3.5 w-3.5" /> View in Production Entry Grid
                </Link>
                <Link
                  href="/reports/size-grade-wip"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 shadow-xs"
                >
                  <Building2 className="h-3.5 w-3.5 text-indigo-600" /> Check WIP Matrix
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      {message && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border p-4 text-xs ${
            message.includes('✓') || message.includes('eligible') || message.includes('Parsed')
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : message.includes('ℹ') || message.includes('already exist')
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-slate-200 bg-slate-50 text-slate-800'
          }`}
        >
          {message.includes('✓') ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          ) : message.includes('ℹ') ? (
            <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-slate-600 mt-0.5" />
          )}
          <div className="leading-relaxed whitespace-pre-line font-medium">{message}</div>
        </div>
      )}

      {/* Interactive Pre-Import Validation & Diff Dashboard */}
      {parsedRows.length > 0 && (
        <div className="space-y-4">
          {/* Validation Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Total Rows</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</div>
            </div>

            <button
              type="button"
              onClick={() => setFilterMode(filterMode === 'valid' ? 'all' : 'valid')}
              className={`rounded-xl border p-3.5 text-left shadow-xs transition-all ${
                filterMode === 'valid'
                  ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                  : 'border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700">Eligible to Record</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-emerald-900">{stats.valid}</div>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode(filterMode === 'invalid' ? 'all' : 'invalid')}
              className={`rounded-xl border p-3.5 text-left shadow-xs transition-all ${
                filterMode === 'invalid'
                  ? 'border-rose-500 bg-rose-50/50 ring-2 ring-rose-500/20'
                  : 'border-rose-200 bg-rose-50/30 hover:bg-rose-50/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-700">Skipped / Issues</span>
                <AlertTriangle className="h-4 w-4 text-rose-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-rose-900">{stats.invalid}</div>
            </button>

            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700">Duplicate WOs</span>
                <Copy className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-1 text-2xl font-bold text-amber-900">{stats.duplicates}</div>
            </div>
          </div>

          {/* Table Controls */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter preview rows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 pl-8 pr-3 text-xs focus:border-slate-800"
                />
              </div>
              <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs font-medium text-slate-600">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`rounded-md px-2.5 py-1 ${filterMode === 'all' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
                >
                  All ({parsedRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('valid')}
                  className={`rounded-md px-2.5 py-1 ${filterMode === 'valid' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-100'}`}
                >
                  Eligible ({stats.valid})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('invalid')}
                  className={`rounded-md px-2.5 py-1 ${filterMode === 'invalid' ? 'bg-rose-600 text-white' : 'hover:bg-slate-100'}`}
                >
                  Issues ({stats.invalid})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={clearImport}
                disabled={loading}
                className="h-9 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void executeImport()}
                disabled={loading || stats.valid === 0 || !canCommit}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-5 text-xs font-bold shadow-sm transition active:scale-[0.98] ${
                  canCommit
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                {!canCommit && <Lock className="h-3.5 w-3.5" />}
                {loading
                  ? 'Recording Data…'
                  : !canCommit
                  ? `Import ${stats.valid} Rows (View-Only)`
                  : `Record ${stats.valid} Eligible ${currentTabConfig.shortLabel} Rows`}
              </button>
            </div>
          </div>

          {/* Validation & Preview Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  {activeTab === 'WORK_ORDERS' ? (
                    <tr>
                      <th className="py-2.5 px-3 text-left">Status / Diff</th>
                      <th className="py-2.5 px-3 text-left">Work Order</th>
                      <th className="py-2.5 px-3 text-left">PO No</th>
                      <th className="py-2.5 px-3 text-left">Customer</th>
                      <th className="py-2.5 px-3 text-left">Specification</th>
                      <th className="py-2.5 px-3 text-right">OD (mm)</th>
                      <th className="py-2.5 px-3 text-right">WT (mm)</th>
                      <th className="py-2.5 px-3 text-right">L1 - L2 (m)</th>
                      <th className="py-2.5 px-3 text-right">Order PCS</th>
                      <th className="py-2.5 px-3 text-right">Order MTR</th>
                      <th className="py-2.5 px-3 text-right">Order MT</th>
                      <th className="py-2.5 px-3 text-right">Bal to Make</th>
                      <th className="py-2.5 px-3 text-left">Target Date</th>
                      <th className="py-2.5 px-3 text-left">Validation Notes</th>
                    </tr>
                  ) : activeTab === 'VDI' ? (
                    <tr>
                      <th className="py-2.5 px-3 text-left">Status</th>
                      <th className="py-2.5 px-3 text-left">Work Order</th>
                      <th className="py-2.5 px-3 text-left">Customer / Spec</th>
                      <th className="py-2.5 px-3 text-right">L1 - L2 (m)</th>
                      <th className="py-2.5 px-3 text-left">Date</th>
                      <th className="py-2.5 px-3 text-right">Inspected (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-right">VDI OK (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-right">Salvage (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-right">Rejection (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-left">Salvage Reason</th>
                      <th className="py-2.5 px-3 text-left">Inspector</th>
                      <th className="py-2.5 px-3 text-left">Validation Notes</th>
                    </tr>
                  ) : activeTab === 'ROLLING' ? (
                    <tr>
                      <th className="py-2.5 px-3 text-left">Status</th>
                      <th className="py-2.5 px-3 text-left">Work Order</th>
                      <th className="py-2.5 px-3 text-left">Customer / Spec</th>
                      <th className="py-2.5 px-3 text-right">L1 - L2 (m)</th>
                      <th className="py-2.5 px-3 text-left">Date / Shift</th>
                      <th className="py-2.5 px-3 text-left">Heat / Lot No</th>
                      <th className="py-2.5 px-3 text-right">Input (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-right font-bold text-indigo-700">Rolled Gross (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-right font-bold text-emerald-700">HTC OK (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-right text-rose-600">Rej (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-left">Operator</th>
                      <th className="py-2.5 px-3 text-left">Remarks</th>
                      <th className="py-2.5 px-3 text-left">Validation Notes</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="py-2.5 px-3 text-left">Status</th>
                      <th className="py-2.5 px-3 text-left">Work Order</th>
                      <th className="py-2.5 px-3 text-left">Customer / Spec</th>
                      <th className="py-2.5 px-3 text-right">L1 - L2 (m)</th>
                      <th className="py-2.5 px-3 text-left">Date / Shift</th>
                      <th className="py-2.5 px-3 text-left">Heat / Lot No</th>
                      <th className="py-2.5 px-3 text-right">Input (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-right font-bold text-indigo-700">Output (Pcs/Mtr)</th>
                      <th className="py-2.5 px-3 text-right text-rose-600">Rej (Pcs/Mtr)</th>
                      {activeTab === 'BAND_SAW' && <th className="py-2.5 px-3 text-right">Scrap MT</th>}
                      {activeTab === 'FINISHING' && <th className="py-2.5 px-3 text-left">Bundle No</th>}
                      <th className="py-2.5 px-3 text-left">Operator</th>
                      <th className="py-2.5 px-3 text-left">Remarks</th>
                      <th className="py-2.5 px-3 text-left">Validation Notes</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedRows.slice(0, 150).map((r, i) => {
                    const isValid = !r.error;
                    return (
                      <tr
                        key={`${r.work_order_no}-${i}`}
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isValid ? 'bg-emerald-50/10' : 'bg-rose-50/20'
                        }`}
                      >
                        <td className="py-2 px-3">
                          {isValid ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                              <XCircle className="h-3 w-3" /> Skipped
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">{r.work_order_no || '—'}</td>

                        {activeTab === 'WORK_ORDERS' ? (
                          <>
                            <td className="py-2 px-3 text-slate-700 font-mono text-[11px]">{r.po_no || '—'}</td>
                            <td className="py-2 px-3 text-slate-700 max-w-[140px] truncate">{r.customer_name || '—'}</td>
                            <td className="py-2 px-3 text-slate-600 max-w-[140px] truncate">{r.specification || '—'}</td>
                            <td className="py-2 px-3 text-right font-mono">{r.od ?? '—'}</td>
                            <td className="py-2 px-3 text-right font-mono">{r.wl ?? '—'}</td>
                            <td className="py-2 px-3 text-right font-mono">{r.l1} - {r.l2}</td>
                            <td className="py-2 px-3 text-right font-mono">{r.ordered_qty_pcs || '—'}</td>
                            <td className="py-2 px-3 text-right font-mono font-medium">{r.ordered_qty_mtr || '—'}</td>
                            <td className="py-2 px-3 text-right font-mono">{r.ordered_qty_mt || '—'}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{r.balance_to_make_mtr}</td>
                            <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">{r.target_date || '—'}</td>
                          </>
                        ) : activeTab === 'VDI' ? (
                          <>
                            <td className="py-2 px-3 text-slate-600 max-w-[140px] truncate">
                              {r.customer_name || r.specification || '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-700">
                              {r.l1 != null && r.l2 != null ? `${r.l1} - ${r.l2}m` : r.l1 != null ? `${r.l1}m` : '—'}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px]">{r.process_date}</td>
                            <td className="py-2 px-3 text-right font-mono">{r.inspected_pcs} pcs / {r.inspected_mtr}m</td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">{r.vdi_ok_pcs} pcs / {r.vdi_ok_mtr}m</td>
                            <td className="py-2 px-3 text-right font-mono text-amber-700">{r.vdi_salvage_pcs} pcs / {r.vdi_salvage_mtr}m</td>
                            <td className="py-2 px-3 text-right font-mono text-rose-700">{r.vdi_rejection_pcs} pcs / {r.vdi_rejection_mtr}m</td>
                            <td className="py-2 px-3 text-slate-700 max-w-[140px] truncate">{r.salvage_reason || '—'}</td>
                            <td className="py-2 px-3 text-slate-600">{r.operator_name || '—'}</td>
                          </>
                        ) : activeTab === 'ROLLING' ? (
                          <>
                            <td className="py-2 px-3 text-slate-600 max-w-[140px] truncate">
                              {r.customer_name || r.specification || '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-700">
                              {r.l1 != null && r.l2 != null ? `${r.l1} - ${r.l2}m` : r.l1 != null ? `${r.l1}m` : '—'}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px]">{r.process_date} (Shift {r.shift})</td>
                            <td className="py-2 px-3 font-mono text-[11px] text-indigo-700">{r.heat_lot_no || '—'}</td>
                            <td className="py-2 px-3 text-right font-mono">{r.input_pcs || '—'} pcs / {r.input_mtr || '—'}m</td>
                            <td className="py-2 px-3 text-right font-mono text-indigo-700 font-bold">{r.output_pcs || '—'} pcs / {r.output_mtr || '—'}m</td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">{r.htc_ok_pcs || '—'} pcs / {r.htc_ok_mtr || '—'}m</td>
                            <td className="py-2 px-3 text-right font-mono text-rose-600">{r.rejection_pcs || '0'} pcs / {r.rejection_mtr || '0'}m</td>
                            <td className="py-2 px-3 text-slate-600">{r.operator_name || '—'}</td>
                            <td className="py-2 px-3 text-slate-500 max-w-[130px] truncate">{r.remarks || '—'}</td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 px-3 text-slate-600 max-w-[140px] truncate">
                              {r.customer_name || r.specification || '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-700">
                              {r.l1 != null && r.l2 != null ? `${r.l1} - ${r.l2}m` : r.l1 != null ? `${r.l1}m` : '—'}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px]">{r.process_date} (Shift {r.shift})</td>
                            <td className="py-2 px-3 font-mono text-[11px] text-indigo-700">{r.heat_lot_no || '—'}</td>
                            <td className="py-2 px-3 text-right font-mono">{r.input_pcs || '—'} pcs / {r.input_mtr || '—'}m</td>
                            <td className="py-2 px-3 text-right font-mono text-indigo-700 font-bold">{r.output_pcs || '—'} pcs / {r.output_mtr || '—'}m</td>
                            <td className="py-2 px-3 text-right font-mono text-rose-600">{r.rejection_pcs || '0'} pcs / {r.rejection_mtr || '0'}m</td>
                            {activeTab === 'BAND_SAW' && <td className="py-2 px-3 text-right font-mono font-medium">{r.scrap_mt || '—'}</td>}
                            {activeTab === 'FINISHING' && <td className="py-2 px-3 font-mono text-indigo-700 font-medium">{r.bundle_no || '—'}</td>}
                            <td className="py-2 px-3 text-slate-600">{r.operator_name || '—'}</td>
                            <td className="py-2 px-3 text-slate-500 max-w-[130px] truncate">{r.remarks || '—'}</td>
                          </>
                        )}

                        <td className="py-2 px-3 max-w-[280px]">
                          {isValid ? (
                            <span className="text-emerald-700 font-medium">Ready for recording</span>
                          ) : (
                            <span className="text-rose-700 font-medium leading-snug block" title={r.error}>
                              {r.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {displayedRows.length > 150 && (
              <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">
                Showing first 150 of {displayedRows.length} matching rows.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
