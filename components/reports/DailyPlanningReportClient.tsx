'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Printer,
  FileSpreadsheet,
  Calendar,
  RotateCw,
  ArrowLeft,
  Filter,
  CheckCircle2,
} from 'lucide-react';
import { DailyPlanItemWithWorkOrder, DailyPlanShift } from '@/types/dailyPlanning';
import { getExcelJS } from '@/lib/excelUtils';

type ReportFormat = 'F_PROD_003' | 'F_PROD_005';

export default function DailyPlanningReportClient() {
  const searchParams = useSearchParams();
  const urlDate = searchParams?.get('date');
  const urlShift = searchParams?.get('shift');
  const urlFormat = searchParams?.get('format');

  const [activeFormat, setActiveFormat] = useState<ReportFormat>(
    urlFormat === 'F_PROD_003' ? 'F_PROD_003' : urlFormat === 'F_PROD_005' ? 'F_PROD_005' : 'F_PROD_003'
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    urlDate || new Date().toISOString().slice(0, 10)
  );
  const [selectedShift, setSelectedShift] = useState<DailyPlanShift>(
    (urlShift as DailyPlanShift) || 'ALL_DAY'
  );

  const [plans, setPlans] = useState<DailyPlanItemWithWorkOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch plans from API
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily-plans?date=${selectedDate}&shift=${selectedShift}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.error && (!data.plans || data.plans.length === 0)) {
        setError(data.error);
      }
      setPlans(data.plans || []);
    } catch (err: any) {
      console.error('Failed to load daily plans for report:', err);
      setError(err?.message || 'Error fetching daily plans');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedShift]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Format header date string matching factory format: "DD -MM-MMM -YYYY"
  const formattedHeaderDate = useMemo(() => {
    try {
      const d = new Date(selectedDate);
      if (isNaN(d.getTime())) return selectedDate;
      const day = String(d.getDate()).padStart(2, '0');
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthStr = monthNames[d.getMonth()];
      const year = d.getFullYear();
      return `${day} -${monthNum}-${monthStr} -${year}`;
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Format revision date (prior day): "DD-Mmm"
  const formattedRevDate = useMemo(() => {
    try {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      const day = String(d.getDate()).padStart(2, '0');
      const monthShort = d.toLocaleString('en-US', { month: 'short' });
      return `${day}-${monthShort}`;
    } catch {
      return '06-Oct';
    }
  }, [selectedDate]);

  // Filter and organize plans based on active template
  const { filteredPlans, sections } = useMemo(() => {
    if (activeFormat === 'F_PROD_003') {
      // Draw Bench Plan: DRAW and PILGER
      const filtered = plans.filter(
        (p) => p.work_center === 'DRAW' || p.work_center === 'PILGER'
      );
      return { filteredPlans: filtered, sections: [] };
    } else {
      // F_PROD_005: HT, STR, CUTTING, VDI & FINISHING
      const filtered = plans.filter(
        (p) =>
          p.work_center === 'HEAT_TREATMENT' ||
          p.work_center === 'HOLLOW_HEAT_TREATMENT' ||
          p.work_center === 'BAND_SAW' ||
          p.work_center === 'VDI' ||
          p.work_center === 'FINISHING'
      );

      // Section 1: Heat Treatment (HOLLOW_HEAT_TREATMENT, HEAT_TREATMENT)
      const htPlans = filtered.filter(
        (p) => p.work_center === 'HEAT_TREATMENT' || p.work_center === 'HOLLOW_HEAT_TREATMENT'
      );
      // Section 2: Cutting / Band Saw
      const cuttingPlans = filtered.filter((p) => p.work_center === 'BAND_SAW');
      // Section 3: VDI & Finishing Line
      const finishingPlans = filtered.filter(
        (p) => p.work_center === 'VDI' || p.work_center === 'FINISHING'
      );

      const s = [
        { title: 'HEAT TREATMENT (HT / ANNEALING)', items: htPlans },
        { title: 'CUTTING / BAND SAW (PRIME CUTTING)', items: cuttingPlans },
        { title: 'VDI & FINISHING LINE (STR, HYDRO, NDT, BUNDLING)', items: finishingPlans },
      ];

      return { filteredPlans: filtered, sections: s };
    }
  }, [activeFormat, plans]);

  // Grand totals
  const grandTotalNos = useMemo(
    () => filteredPlans.reduce((sum, p) => sum + (Number(p.target_pcs) || 0), 0),
    [filteredPlans]
  );
  const grandTotalMt = useMemo(
    () => filteredPlans.reduce((sum, p) => sum + (Number(p.target_mt) || 0), 0),
    [filteredPlans]
  );

  // Minimum row count so the printed sheet matches the factory template height
  const minRows = activeFormat === 'F_PROD_003' ? 20 : 24;
  const emptyRowsNeeded = Math.max(0, minRows - filteredPlans.length);

  // Export to Excel adhering strictly to factory format layout with full borders
  const handleExportExcel = async () => {
    const ExcelJS = await getExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Rashmi Green Hydrogen Steel Pvt. Ltd.';
    wb.created = new Date();

    const isF003 = activeFormat === 'F_PROD_003';
    const reportTitle = isF003
      ? 'DAILY , DRAW BENCH PLAN'
      : 'DAILY ,HT, STR , CUTTING , VDI & FINISHING PLAN';
    const formatNo = isF003 ? 'Format No. F PROD - 003' : 'Format No. F PROD - 005';
    const sheetName = isF003 ? 'Draw_Bench_Plan' : 'Finishing_Plan';

    const ws = wb.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    ws.columns = [
      { width: 7 },  // 1: Sr. No
      { width: 14 }, // 2: WO NO
      { width: 24 }, // 3: Customer
      { width: 20 }, // 4: Grade/SPEC
      { width: 10 }, // 5: OD
      { width: 10 }, // 6: WT
      { width: 12 }, // 7: FACTOR
      { width: 11 }, // 8: Proc. Wall
      { width: 11 }, // 9: Kg/Mtr.
      { width: 14 }, // 10: Final Lgth Min.
      { width: 14 }, // 11: Final Lgth Max.
      { width: 12 }, // 12: Avg. Lgth
      { width: 12 }, // 13: Stage
      { width: 10 }, // 14: Nos
      { width: 12 }, // 15: MT.
    ];

    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    };

    // Row 1: Company header & Date
    ws.mergeCells('A1:C1');
    const a1 = ws.getCell('A1');
    a1.value = 'RASHMI SEAMLESS';
    a1.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    a1.alignment = { vertical: 'middle', horizontal: 'left' };

    ws.mergeCells('D1:M1');
    const d1 = ws.getCell('D1');
    d1.value = 'RASHMI GREEN HYDROGEN STEEL PVT. LTD.';
    d1.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FF0F172A' } };
    d1.alignment = { vertical: 'middle', horizontal: 'center' };

    ws.mergeCells('N1:O1');
    const n1 = ws.getCell('N1');
    n1.value = formattedHeaderDate;
    n1.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF334155' } };
    n1.alignment = { vertical: 'middle', horizontal: 'right' };
    ws.getRow(1).height = 22;

    // Row 2: Subheader
    ws.mergeCells('D2:M2');
    const d2 = ws.getCell('D2');
    d2.value = '(SEAMLESS DIVISION)';
    d2.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF475569' } };
    d2.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(2).height = 18;

    // Row 3: Plan Title
    ws.mergeCells('D3:M3');
    const d3 = ws.getCell('D3');
    d3.value = reportTitle;
    d3.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    d3.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(3).height = 20;

    // Row 4: ONLINE PLAN & REV
    ws.mergeCells('A4:C4');
    const a4 = ws.getCell('A4');
    a4.value = 'ONLINE PLAN';
    a4.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
    a4.alignment = { vertical: 'middle', horizontal: 'left' };

    ws.mergeCells('N4:O4');
    const n4 = ws.getCell('N4');
    n4.value = `REV -00 ${formattedRevDate}`;
    n4.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF475569' } };
    n4.alignment = { vertical: 'middle', horizontal: 'right' };
    ws.getRow(4).height = 18;

    // Row 5: Column Headers (15 Columns)
    const headerRow = ws.getRow(5);
    headerRow.values = [
      'Sr. No',
      'WO NO',
      'Customer',
      'Grade/SPEC',
      'OD',
      'WT',
      'FACTOR',
      'Proc. Wall',
      'Kg/Mtr.',
      'Final Lgth Min.',
      'Final Lgth Max.',
      'Avg. Lgth',
      'Stage',
      'Nos',
      'MT.',
    ];
    headerRow.height = 25;
    headerRow.eachCell({ includeEmpty: true }, (cell: any) => {
      cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'medium' as const, color: { argb: 'FF0F172A' } },
        bottom: { style: 'medium' as const, color: { argb: 'FF0F172A' } },
        left: { style: 'thin' as const, color: { argb: 'FF475569' } },
        right: { style: 'thin' as const, color: { argb: 'FF475569' } },
      };
    });

    let currentRowIdx = 6;
    let srNo = 1;

    const addDataRow = (vals: any[], isZebra = false) => {
      const row = ws.getRow(currentRowIdx++);
      row.values = vals;
      row.height = 20;
      row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF0F172A' } };
        cell.border = thinBorder;
        if (isZebra) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        if (typeof cell.value === 'number') {
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (colNumber === 1 || colNumber === 2 || colNumber === 13) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    };

    if (isF003) {
      filteredPlans.forEach((p, idx) => {
        const od = p.size_od ?? '';
        const wt = p.size_wt ?? '';
        const factor = p.factor ?? (od && wt ? Number(((od - wt) * wt).toFixed(4)) : '');
        const kgMtr = p.kg_per_mtr ?? (factor ? Number((Number(factor) * 0.0246615).toFixed(3)) : '');
        const procWall = p.proc_wall ?? p.size_wt ?? '';
        const l1 = p.l1 ?? '';
        const l2 = p.l2 ?? '';
        const avgLgth = p.avg_length ?? '';
        const stage = p.work_center === 'DRAW' ? 'DRAW' : p.work_center;
        const nos = p.target_pcs || 0;
        const mt = Number((p.target_mt || 0).toFixed(3));

        addDataRow([
          srNo++,
          p.work_order_no,
          p.customer_name || '—',
          `${p.grade || ''} ${p.specification || ''}`.trim() || '—',
          od,
          wt,
          factor,
          procWall,
          kgMtr,
          l1,
          l2,
          avgLgth,
          stage,
          nos,
          mt,
        ], idx % 2 === 1);
      });

      for (let i = 0; i < emptyRowsNeeded; i++) {
        addDataRow(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      }
    } else {
      // F_PROD_005 Sectioned Rows
      let totalRowCounter = 0;
      sections.forEach((sec) => {
        let secNos = 0;
        let secMt = 0;

        sec.items.forEach((p) => {
          const od = p.size_od ?? '';
          const wt = p.size_wt ?? '';
          const factor = p.factor ?? (od && wt ? Number(((od - wt) * wt).toFixed(4)) : '');
          const kgMtr = p.kg_per_mtr ?? (factor ? Number((Number(factor) * 0.0246615).toFixed(3)) : '');
          const procWall = p.proc_wall ?? p.size_wt ?? '';
          const l1 = p.l1 ?? '';
          const l2 = p.l2 ?? '';
          const avgLgth = p.avg_length ?? '';
          const stage =
            p.work_center === 'HEAT_TREATMENT' || p.work_center === 'HOLLOW_HEAT_TREATMENT'
              ? 'HT'
              : p.work_center === 'BAND_SAW'
              ? 'CUTTING'
              : p.work_center;
          const nos = p.target_pcs || 0;
          const mt = Number((p.target_mt || 0).toFixed(3));

          secNos += nos;
          secMt += mt;

          addDataRow([
            srNo++,
            p.work_order_no,
            p.customer_name || '—',
            `${p.grade || ''} ${p.specification || ''}`.trim() || '—',
            od,
            wt,
            factor,
            procWall,
            kgMtr,
            l1,
            l2,
            avgLgth,
            stage,
            nos,
            mt,
          ], totalRowCounter++ % 2 === 1);
        });

        if (sec.items.length === 0) {
          addDataRow(['', '', '', `[ ${sec.title} - No Orders Planned ]`, '', '', '', '', '', '', '', '', '', '', '']);
        }

        // Section Subtotal Row
        const subRow = ws.getRow(currentRowIdx++);
        subRow.values = ['', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL=>', secNos, Number(secMt.toFixed(3))];
        subRow.height = 20;
        subRow.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
          cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1E293B' } };
          cell.border = thinBorder;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          if (colNumber >= 13) {
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }
        });
      });
    }

    // Grand Total Row
    const totalRow = ws.getRow(currentRowIdx++);
    totalRow.values = ['', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL=>', grandTotalNos, Number(grandTotalMt.toFixed(3))];
    totalRow.height = 22;
    totalRow.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = {
        top: { style: 'thin' as const, color: { argb: 'FF0F172A' } },
        bottom: { style: 'double' as const, color: { argb: 'FF0F172A' } },
        left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      };
      if (colNumber >= 13) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    });

    // Footer Row
    currentRowIdx++;
    ws.mergeCells(`A${currentRowIdx}:O${currentRowIdx}`);
    const fCell = ws.getCell(`A${currentRowIdx}`);
    fCell.value = `${formatNo}, Eff . Date : 01.04.2023, Rev. 02. Rev. Date : 01.04.2026, / PPC`;
    fCell.font = { name: 'Segoe UI', size: 8, italic: true, color: { argb: 'FF64748B' } };
    fCell.alignment = { vertical: 'middle', horizontal: 'left' };

    // Trigger download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileName = `${isF003 ? 'Draw_Bench_Plan_F_PROD_003' : 'Daily_Finishing_Plan_F_PROD_005'}_${selectedDate}_${selectedShift}.xlsx`;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 p-2 sm:p-4 md:p-6 print:p-0 print:bg-white print:m-0">
      {/* Print-specific style rules */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: A4 landscape;
            margin: 6mm 6mm 6mm 6mm;
          }
          header, nav, aside, .no-print, [role="navigation"] {
            display: none !important;
          }
          .sheet-container {
            border: 1.5px solid #000 !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .mill-table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          .mill-table th, .mill-table td {
            border: 1px solid #000 !important;
            padding: 2px 3px !important;
            font-size: 8.5pt !important;
            line-height: 1.15 !important;
          }
          .yellow-highlight {
            background-color: #FFFF00 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Control Bar & Filter Actions (Hidden in Print) */}
      <div className="no-print mx-auto max-w-7xl mb-4 space-y-3">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center gap-3">
            <Link
              href={`/daily-plans?date=${selectedDate}&shift=${selectedShift}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Planning Console
            </Link>
            <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />
            <div>
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                Factory Official Daily Planning Reports
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                  Mill Standard
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Pixel-perfect factory sheets matching Format No. F PROD - 003 & F PROD - 005
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={fetchPlans}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 cursor-pointer shadow-2xs"
            >
              <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white transition cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel (.xlsx)
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white transition cursor-pointer shadow-2xs"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF (A4)
            </button>
          </div>
        </div>

        {/* Template Format Switcher & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs">
          {/* Format Tabs */}
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setActiveFormat('F_PROD_003')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeFormat === 'F_PROD_003'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {activeFormat === 'F_PROD_003' && <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />}
              Format F PROD - 003 (Draw Bench Plan)
            </button>
            <button
              type="button"
              onClick={() => setActiveFormat('F_PROD_005')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeFormat === 'F_PROD_005'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {activeFormat === 'F_PROD_005' && <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />}
              Format F PROD - 005 (HT, STR, Cutting & Finishing)
            </button>
          </div>

          {/* Date & Shift Filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500" />
              <label htmlFor="report-date-picker" className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Plan Date:
              </label>
              <input
                id="report-date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs font-mono font-bold text-slate-900 dark:text-white"
              />
            </div>

            {/* Shift Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Shift:</span>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5">
                {(['ALL_DAY', 'SHIFT_A', 'SHIFT_B', 'SHIFT_C'] as DailyPlanShift[]).map((sh) => (
                  <button
                    key={sh}
                    type="button"
                    onClick={() => setSelectedShift(sh)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                      selectedShift === sh
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {sh === 'ALL_DAY' ? 'All Day' : sh.replace('SHIFT_', 'Shift ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 font-medium">
            Note: {error}
          </div>
        )}
      </div>

      {/* Main Factory Document Sheet Container */}
      <div className="sheet-container mx-auto max-w-[1240px] bg-white text-black border border-black shadow-lg overflow-x-auto print:border-black">
        {/* Top Header Grid */}
        <div className="grid grid-cols-12 border-b border-black">
          {/* Rashmi Logo Box */}
          <div className="col-span-3 p-2 flex flex-col justify-center items-center border-r border-black">
            <div className="flex items-center gap-1.5">
              {/* Sunburst icon */}
              <svg className="w-5 h-5 text-red-600 fill-red-600" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="4" fill="#dc2626" />
                <path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12m11.32-11.32l2.12-2.12" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              <span className="text-xl font-black tracking-tight text-red-600 leading-none">
                RASHMI
              </span>
            </div>
            <div className="w-full flex items-center justify-center gap-1 mt-0.5">
              <span className="text-[7px] font-black tracking-widest uppercase text-black">
                —— SEAMLESS ——
              </span>
            </div>
          </div>

          {/* Company Title & Plan Header */}
          <div className="col-span-7 p-2 text-center flex flex-col justify-center items-center">
            <h1 className="text-sm sm:text-base font-bold tracking-tight text-black uppercase font-serif">
              RASHMI GREEN HYDROGEN STEEL PVT. LTD.
            </h1>
            <p className="text-xs font-bold text-black uppercase tracking-wide">
              (SEAMLESS DIVISION)
            </p>
            <h2 className="text-xs sm:text-sm font-bold text-black uppercase mt-0.5 tracking-wider">
              {activeFormat === 'F_PROD_003'
                ? 'DAILY , DRAW BENCH PLAN'
                : 'DAILY ,HT, STR , CUTTING , VDI & FINISHING PLAN'}
            </h2>
          </div>

          {/* Date Box Top-Right */}
          <div className="col-span-2 border-l border-black p-2 flex items-center justify-center font-bold text-xs text-black text-center font-mono">
            {formattedHeaderDate}
          </div>
        </div>

        {/* Subheader Bar: ONLINE PLAN | Empty Middle | REV -00 & Date */}
        <div className="grid grid-cols-12 border-b border-black text-xs font-bold text-black">
          {/* ONLINE PLAN Box */}
          <div className="col-span-3 p-1.5 border-r border-black uppercase tracking-wider font-extrabold flex items-center">
            ONLINE PLAN
          </div>

          {/* Empty spacer cols matching the factory sheet */}
          <div className="col-span-6 border-r border-black"></div>

          {/* REV -00 Box */}
          <div className="col-span-1.5 p-1 border-r border-black text-center font-bold">
            REV -00
          </div>

          {/* Revision Date */}
          <div className="col-span-1.5 p-1 text-center font-bold font-mono">
            {formattedRevDate}
          </div>
        </div>

        {/* 15-Column Table Grid */}
        <table className="mill-table w-full border-collapse text-[10px] sm:text-[11px] leading-tight">
          <thead>
            <tr className="border-b border-black bg-white font-bold text-center">
              <th className="border-r border-black p-1 w-[38px]">Sr. No</th>
              <th className="border-r border-black p-1 w-[80px]">WO NO</th>
              <th className="border-r border-black p-1 w-[160px] text-left">Customer</th>
              <th className="border-r border-black p-1 w-[130px] text-left">Grade/SPEC</th>
              <th className="border-r border-black p-1 w-[55px] text-right">OD</th>
              <th className="border-r border-black p-1 w-[55px] text-right">WT</th>
              <th className="border-r border-black p-1 w-[65px] text-right">FACTOR</th>
              <th className="border-r border-black p-1 w-[65px] text-right">Proc. Wall</th>
              <th className="border-r border-black p-1 w-[60px] text-right">Kg/Mtr.</th>
              <th className="border-r border-black p-1 w-[68px] text-right">Final Lgth<br />Min.</th>
              <th className="border-r border-black p-1 w-[68px] text-right">Final Lgth<br />Max.</th>
              <th className="border-r border-black p-1 w-[65px] text-right">Avg. Lgth</th>
              <th className="border-r border-black p-1 w-[70px]">Stage</th>
              <th className="border-r border-black p-1 w-[55px] text-right">Nos</th>
              <th className="p-1 w-[65px] text-right">MT.</th>
            </tr>
          </thead>
          <tbody>
            {activeFormat === 'F_PROD_003' ? (
              // Format F PROD - 003: Draw Bench rows
              <>
                {filteredPlans.map((p, idx) => {
                  const od = p.size_od ? Number(p.size_od).toFixed(2) : '—';
                  const wt = p.size_wt ? Number(p.size_wt).toFixed(2) : '—';
                  const factor = p.factor ? Number(p.factor).toFixed(4) : (p.size_od && p.size_wt ? ((p.size_od - p.size_wt) * p.size_wt).toFixed(4) : '—');
                  const kgMtr = p.kg_per_mtr ? Number(p.kg_per_mtr).toFixed(3) : (p.factor ? (Number(p.factor) * 0.0246615).toFixed(3) : '—');
                  const procWall = p.proc_wall ? Number(p.proc_wall).toFixed(2) : (p.size_wt ? Number(p.size_wt).toFixed(2) : '—');
                  const l1 = p.l1 ? Number(p.l1).toFixed(2) : '—';
                  const l2 = p.l2 ? Number(p.l2).toFixed(2) : '—';
                  const avgLgth = p.avg_length ? Number(p.avg_length).toFixed(2) : '—';
                  const stageName = p.work_center === 'DRAW' ? 'DRAW' : p.work_center;

                  return (
                    <tr key={p.id} className="border-b border-black hover:bg-slate-50">
                      <td className="border-r border-black p-1 text-center font-mono">{idx + 1}</td>
                      <td className="border-r border-black p-1 text-center font-mono font-bold">{p.work_order_no}</td>
                      <td className="border-r border-black p-1 truncate max-w-[160px]">{p.customer_name || '—'}</td>
                      <td className="border-r border-black p-1 truncate max-w-[130px]">
                        {`${p.grade || ''} ${p.specification || ''}`.trim() || '—'}
                      </td>
                      <td className="border-r border-black p-1 text-right font-mono">{od}</td>
                      <td className="border-r border-black p-1 text-right font-mono">{wt}</td>
                      <td className="border-r border-black p-1 text-right font-mono">{factor}</td>
                      <td className="border-r border-black p-1 text-right font-mono">{procWall}</td>
                      <td className="border-r border-black p-1 text-right font-mono">{kgMtr}</td>
                      <td className="border-r border-black p-1 text-right font-mono">{l1}</td>
                      <td className="border-r border-black p-1 text-right font-mono">{l2}</td>
                      <td className="border-r border-black p-1 text-right font-mono">{avgLgth}</td>
                      <td className="border-r border-black p-1 text-center font-bold">{stageName}</td>
                      <td className="border-r border-black p-1 text-right font-mono font-bold">{p.target_pcs || 0}</td>
                      <td className="p-1 text-right font-mono font-bold">{Number(p.target_mt || 0).toFixed(3)}</td>
                    </tr>
                  );
                })}

                {/* Blank rows to complete full factory sheet grid */}
                {Array.from({ length: emptyRowsNeeded }).map((_, i) => (
                  <tr key={`empty-${i}`} className="border-b border-black h-[22px]">
                    <td className="border-r border-black p-1 text-center font-mono text-transparent select-none">-</td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="border-r border-black p-1"></td>
                    <td className="p-1"></td>
                  </tr>
                ))}

                {/* Grand Total Row with Bright Yellow Highlight */}
                <tr className="border-b border-black font-extrabold">
                  <td colSpan={12} className="border-r border-black p-1"></td>
                  <td className="border-r border-black p-1 text-center uppercase tracking-wider bg-[#FFFF00] yellow-highlight">
                    TOTAL
                  </td>
                  <td className="border-r border-black p-1 text-right font-mono bg-[#FFFF00] yellow-highlight">
                    {grandTotalNos}
                  </td>
                  <td className="p-1 text-right font-mono bg-[#FFFF00] yellow-highlight">
                    {grandTotalMt.toFixed(3)}
                  </td>
                </tr>
              </>
            ) : (
              // Format F PROD - 005: Sectioned by Stage/Operation with Section Subtotals
              <>
                {sections.map((sec, secIdx) => {
                  const secNos = sec.items.reduce((s, p) => s + (Number(p.target_pcs) || 0), 0);
                  const secMt = sec.items.reduce((s, p) => s + (Number(p.target_mt) || 0), 0);

                  return (
                    <React.Fragment key={sec.title}>
                      {/* Section Items */}
                      {sec.items.map((p, itemIdx) => {
                        const od = p.size_od ? Number(p.size_od).toFixed(2) : '—';
                        const wt = p.size_wt ? Number(p.size_wt).toFixed(2) : '—';
                        const factor = p.factor ? Number(p.factor).toFixed(4) : (p.size_od && p.size_wt ? ((p.size_od - p.size_wt) * p.size_wt).toFixed(4) : '—');
                        const kgMtr = p.kg_per_mtr ? Number(p.kg_per_mtr).toFixed(3) : (p.factor ? (Number(p.factor) * 0.0246615).toFixed(3) : '—');
                        const procWall = p.proc_wall ? Number(p.proc_wall).toFixed(2) : (p.size_wt ? Number(p.size_wt).toFixed(2) : '—');
                        const l1 = p.l1 ? Number(p.l1).toFixed(2) : '—';
                        const l2 = p.l2 ? Number(p.l2).toFixed(2) : '—';
                        const avgLgth = p.avg_length ? Number(p.avg_length).toFixed(2) : '—';
                        const stageName =
                          p.work_center === 'HEAT_TREATMENT' || p.work_center === 'HOLLOW_HEAT_TREATMENT'
                            ? 'HT'
                            : p.work_center === 'BAND_SAW'
                            ? 'CUTTING'
                            : p.work_center;

                        return (
                          <tr key={p.id} className="border-b border-black hover:bg-slate-50">
                            <td className="border-r border-black p-1 text-center font-mono">
                              {secIdx * 10 + itemIdx + 1}
                            </td>
                            <td className="border-r border-black p-1 text-center font-mono font-bold">
                              {p.work_order_no}
                            </td>
                            <td className="border-r border-black p-1 truncate max-w-[160px]">
                              {p.customer_name || '—'}
                            </td>
                            <td className="border-r border-black p-1 truncate max-w-[130px]">
                              {`${p.grade || ''} ${p.specification || ''}`.trim() || '—'}
                            </td>
                            <td className="border-r border-black p-1 text-right font-mono">{od}</td>
                            <td className="border-r border-black p-1 text-right font-mono">{wt}</td>
                            <td className="border-r border-black p-1 text-right font-mono">{factor}</td>
                            <td className="border-r border-black p-1 text-right font-mono">{procWall}</td>
                            <td className="border-r border-black p-1 text-right font-mono">{kgMtr}</td>
                            <td className="border-r border-black p-1 text-right font-mono">{l1}</td>
                            <td className="border-r border-black p-1 text-right font-mono">{l2}</td>
                            <td className="border-r border-black p-1 text-right font-mono">{avgLgth}</td>
                            <td className="border-r border-black p-1 text-center font-bold">{stageName}</td>
                            <td className="border-r border-black p-1 text-right font-mono font-bold">
                              {p.target_pcs || 0}
                            </td>
                            <td className="p-1 text-right font-mono font-bold">
                              {Number(p.target_mt || 0).toFixed(3)}
                            </td>
                          </tr>
                        );
                      })}

                      {/* If no items planned for this section, display 2 blank rows */}
                      {sec.items.length === 0 && (
                        <>
                          <tr className="border-b border-black h-[22px]">
                            <td className="border-r border-black p-1 text-center font-mono text-slate-400 select-none">-</td>
                            <td colSpan={11} className="border-r border-black p-1 text-slate-400 italic">
                              [ {sec.title} - No Orders Planned ]
                            </td>
                            <td className="border-r border-black p-1"></td>
                            <td className="border-r border-black p-1"></td>
                            <td className="p-1"></td>
                          </tr>
                          <tr className="border-b border-black h-[22px]">
                            <td className="border-r border-black p-1"></td>
                            <td colSpan={11} className="border-r border-black p-1"></td>
                            <td className="border-r border-black p-1"></td>
                            <td className="border-r border-black p-1"></td>
                            <td className="p-1"></td>
                          </tr>
                        </>
                      )}

                      {/* Section Subtotal Row (Yellow highlight on Nos and MT as in Image 2) */}
                      <tr className="border-b border-black font-extrabold">
                        <td colSpan={12} className="border-r border-black p-1"></td>
                        <td className="border-r border-black p-1 text-center uppercase tracking-wider bg-white"></td>
                        <td className="border-r border-black p-1 text-right font-mono bg-[#FFFF00] yellow-highlight">
                          {secNos}
                        </td>
                        <td className="p-1 text-right font-mono bg-[#FFFF00] yellow-highlight">
                          {secMt.toFixed(3)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* Grand Total Row at Bottom with TOTAL=> in Yellow */}
                <tr className="border-b border-black font-extrabold">
                  <td colSpan={11} className="border-r border-black p-1"></td>
                  <td colSpan={2} className="border-r border-black p-1 text-center uppercase tracking-wider bg-[#FFFF00] yellow-highlight">
                    TOTAL=&gt;
                  </td>
                  <td className="border-r border-black p-1 text-right font-mono bg-[#FFFF00] yellow-highlight">
                    {grandTotalNos}
                  </td>
                  <td className="p-1 text-right font-mono bg-[#FFFF00] yellow-highlight">
                    {grandTotalMt.toFixed(3)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {/* Footer Bar: Format No, Eff Date, Rev No & PPC Box */}
        <div className="border-t border-black p-1.5 flex items-center justify-between text-[9.5px] font-bold text-black font-mono">
          <div className="border border-black px-2 py-0.5">
            {activeFormat === 'F_PROD_003'
              ? 'Format No. F PROD - 003, Eff . Date : 01.04.2023, Rev. 02. Rev. Date : 01.04.2026, / PPC'
              : 'Format No. F PROD - 005, Eff . Date : 01.04.2023, Rev. 02. Rev. Date : 01.04.2026, / PPC'}
          </div>
          <div className="text-[8.5px] font-sans text-slate-500">
            System Generated Mill Planning Ledger · Rashmi Green Hydrogen Steel Pvt. Ltd. (Seamless Division)
          </div>
        </div>
      </div>
    </div>
  );
}
