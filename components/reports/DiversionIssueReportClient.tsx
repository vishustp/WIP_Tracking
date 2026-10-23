'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Search,
  RefreshCw,
  Download,
  Shuffle,
  ArrowRight,
  X,
  FileText,
  BadgeCheck,
  Building2,
  Calendar,
  Flame,
  FileSpreadsheet,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getXlsx, getExcelJS, exportJsonToExcel } from '@/lib/excelUtils';
import { toast } from 'sonner';

export type DiversionPlanItem = {
  id: string;
  source_wo_id: string;
  source_wo_no: string;
  source_customer: string;
  source_grade: string;
  source_size: string;
  target_wo_id: string;
  target_wo_no: string;
  target_customer: string;
  target_grade: string;
  target_size: string;
  diverted_qty: number;
  diverted_pcs: number;
  diverted_mt: number;
  work_center: string;
  work_center_name: string;
  route_id: string;
  route_code: string;
  route_name: string;
  multiple: number;
  reason: string;
  approved_by: string;
  diversion_date: string;
  created_at: string;
  updated_at?: string;
  can_modify: boolean;
};

const WORK_CENTER_LABELS: Record<string, { label: string; color: string }> = {
  ROLLING: { label: 'Hot Rolling Mill', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  HOLLOW_HEAT_TREATMENT: { label: 'Hollow Heat Treatment', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  DRAW: { label: 'Cold Draw Bench', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  HEAT_TREATMENT: { label: 'Final Heat Treatment', color: 'bg-rose-100 text-rose-800 border-rose-200' },
  FINISHING: { label: 'Finishing & Inspection', color: 'bg-teal-100 text-teal-800 border-teal-200' },
};

const fmt = (n: number | null | undefined, digits = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function DiversionIssueReportClient() {
  const [plans, setPlans] = useState<DiversionPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [workCenterFilter, setWorkCenterFilter] = useState('ALL');
  const [routeFilter, setRouteFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [routes, setRoutes] = useState<{ id: string; route_code: string; route_name: string }[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [todayStr, setTodayStr] = useState<string>('');

  useEffect(() => {
    setTodayStr(new Date().toLocaleDateString('en-GB'));
  }, []);

  const [selectedPlanForSlip, setSelectedPlanForSlip] = useState<DiversionPlanItem | null>(null);
  const [manualHeatNo, setManualHeatNo] = useState<string>('');

  // Auto-extract Heat / Lot No from reason when memo opens
  useEffect(() => {
    if (selectedPlanForSlip) {
      const reason = selectedPlanForSlip.reason || '';
      const heatMatch = reason.match(/HEAT[:\s]+([A-Za-z0-9\-_/]+)/i);
      const lotMatch = reason.match(/LOT[:\s]+([A-Za-z0-9\-_/]+)/i);
      if (heatMatch && heatMatch[1]) {
        setManualHeatNo(heatMatch[1].trim());
      } else if (lotMatch && lotMatch[1]) {
        setManualHeatNo(lotMatch[1].trim());
      } else {
        setManualHeatNo('');
      }
    } else {
      setManualHeatNo('');
    }
  }, [selectedPlanForSlip]);

  const getAuthorisedName = useCallback(
    (emailOrName: string | null | undefined): string => {
      if (!emailOrName) return 'PPC In-Charge';
      const trimmed = emailOrName.trim();
      const lower = trimmed.toLowerCase();
      if (userMap[lower]) {
        return userMap[lower];
      }
      // If looks like an email and not in map, format the local part nicely
      if (trimmed.includes('@')) {
        const handle = trimmed.split('@')[0];
        return handle
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
      return trimmed;
    },
    [userMap]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = createClient();
      const [divRes, routesRes, usersRes] = await Promise.all([
        s.rpc('get_diversion_plans', {
          p_search: search.trim() || null,
          p_route_code: routeFilter === 'ALL' ? null : routeFilter,
          p_work_center: workCenterFilter === 'ALL' ? null : workCenterFilter,
          p_from_date: fromDate || null,
          p_to_date: toDate || null,
          p_limit: 2000,
        }),
        s.from('process_routes').select('id,route_code,route_name').eq('active', true).order('route_code'),
        s.from('app_users').select('email,employee_name'),
      ]);

      if (divRes.error) throw divRes.error;
      setPlans((divRes.data ?? []) as DiversionPlanItem[]);

      if (routesRes.data) {
        setRoutes(routesRes.data);
      }

      if (usersRes.data) {
        const map: Record<string, string> = {};
        usersRes.data.forEach((u: any) => {
          if (u.email && u.employee_name) {
            map[u.email.trim().toLowerCase()] = u.employee_name.trim();
          }
        });
        setUserMap(map);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load diversion plans.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [search, routeFilter, workCenterFilter, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalMtr = 0;
    let totalPcs = 0;
    let totalMt = 0;
    const stageCounts: Record<string, number> = {};

    plans.forEach((p) => {
      const mult = p.multiple && Number(p.multiple) > 1 ? Number(p.multiple) : 1;
      totalMtr += Number(p.diverted_qty || 0);
      totalPcs += Math.round(Number(p.diverted_pcs || 0) * mult);
      totalMt += Number(p.diverted_mt || 0);
      stageCounts[p.work_center] = (stageCounts[p.work_center] || 0) + 1;
    });

    return {
      count: plans.length,
      totalMtr,
      totalPcs,
      totalMt,
      stageCounts,
    };
  }, [plans]);

  const exportCSV = () => {
    if (!plans.length) {
      toast.error('No diversion data to export.');
      return;
    }

    const headers = [
      'Diversion Date',
      'Work Center',
      'Source WO #',
      'Source Customer',
      'Source Grade',
      'Source Size',
      'Target WO #',
      'Target Customer',
      'Target Grade',
      'Target Size',
      'Diverted MTR',
      'Diverted PCS',
      'Diverted MT',
      'Multiple',
      'Route',
      'Reason',
      'Approved By',
    ];

    const rows = plans.map((p) => [
      p.diversion_date,
      p.work_center_name || p.work_center,
      p.source_wo_no,
      `"${(p.source_customer || '').replace(/"/g, '""')}"`,
      p.source_grade || '',
      `"${p.source_size || ''}"`,
      p.target_wo_no,
      `"${(p.target_customer || '').replace(/"/g, '""')}"`,
      p.target_grade || '',
      `"${p.target_size || ''}"`,
      p.diverted_qty ?? 0,
      p.multiple && Number(p.multiple) > 1 ? Math.round(Number(p.diverted_pcs || 0) * Number(p.multiple)) : (p.diverted_pcs ?? 0),
      p.diverted_mt ?? 0,
      p.multiple ?? 1,
      p.route_code || '',
      `"${(p.reason || '').replace(/"/g, '""')}"`,
      `"${getAuthorisedName(p.approved_by).replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Material_Diversion_Issue_Schedule_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Diversion plans exported to CSV.');
  };

  const exportScheduleToExcel = async () => {
    try {
      const rows = plans.map((p) => ({
        'Date': p.diversion_date,
        'Station': p.work_center_name || p.work_center,
        'Source WO': p.source_wo_no,
        'Source Customer': p.source_customer || '',
        'Source Grade': p.source_grade || '',
        'Source Size': p.source_size || '',
        'Target WO': p.target_wo_no,
        'Target Customer': p.target_customer || '',
        'Target Grade': p.target_grade || '',
        'Target Size': p.target_size || '',
        'Diverted MTR': Number(p.diverted_qty ?? 0),
        'Diverted PCS': Number(p.diverted_pcs ?? 0),
        'Diverted MT': Number(p.diverted_mt ?? 0),
        'Multiple': p.multiple ?? 1,
        'Route': p.route_code || '',
        'Reason': p.reason || '',
        'Approved By': getAuthorisedName(p.approved_by),
      }));

      await exportJsonToExcel(
        rows,
        'Diversion_Schedule',
        `Material_Diversion_Schedule_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      toast.success('Diversion schedule exported to Excel (.xlsx) with formal borders.');
    } catch (err: any) {
      toast.error('Failed to export schedule to Excel: ' + (err?.message || 'Error'));
    }
  };

  const exportMemoToExcel = async (plan: DiversionPlanItem, heatNo: string) => {
    try {
      const ExcelJS = await getExcelJS();
      const authName = getAuthorisedName(plan.approved_by);
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Rashmi Green Hydrogen Steel Pvt. Ltd.';
      wb.created = new Date();

      const ws = wb.addWorksheet('Transfer_Memo', {
        views: [{ showGridLines: true }],
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
      });

      // Columns: A (Label 1), B (Value 1), C (Spacer), D (Label 2), E (Value 2)
      ws.columns = [
        { width: 18 },
        { width: 30 },
        { width: 3 },
        { width: 18 },
        { width: 30 },
      ];

      const thinBorder = {
        top: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
        left: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
        right: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
      };

      const darkBorder = {
        top: { style: 'medium' as const, color: { argb: 'FF1E293B' } },
        left: { style: 'medium' as const, color: { argb: 'FF1E293B' } },
        bottom: { style: 'medium' as const, color: { argb: 'FF1E293B' } },
        right: { style: 'medium' as const, color: { argb: 'FF1E293B' } },
      };

      const applyBox = (r1: number, c1: number, r2: number, c2: number, bStyle: any = thinBorder) => {
        for (let r = r1; r <= r2; r++) {
          for (let c = c1; c <= c2; c++) {
            const cell = ws.getCell(r, c);
            cell.border = {
              top: r === r1 ? bStyle.top : thinBorder.top,
              bottom: r === r2 ? bStyle.bottom : thinBorder.bottom,
              left: c === c1 ? bStyle.left : thinBorder.left,
              right: c === c2 ? bStyle.right : thinBorder.right,
            };
          }
        }
      };

      // 1. Company Formal Title Header
      ws.mergeCells('A1:E1');
      const a1 = ws.getCell('A1');
      a1.value = 'RASHMI GREEN HYDROGEN STEEL PVT. LTD.';
      a1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } };
      a1.alignment = { horizontal: 'center', vertical: 'middle' };
      a1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      ws.getRow(1).height = 24;

      ws.mergeCells('A2:E2');
      const a2 = ws.getCell('A2');
      a2.value = '(SEAMLESS DIVISION) · SHOP FLOOR CIRCULATION SLIP';
      a2.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
      a2.alignment = { horizontal: 'center', vertical: 'middle' };
      a2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      ws.getRow(2).height = 18;

      ws.mergeCells('A3:E3');
      const a3 = ws.getCell('A3');
      a3.value = 'MATERIAL DIVERSION & INTER-ORDER TRANSFER MEMO';
      a3.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
      a3.alignment = { horizontal: 'center', vertical: 'middle' };
      a3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      ws.getRow(3).height = 22;
      applyBox(1, 1, 3, 5, darkBorder);

      // Row 4: Meta Information
      ws.getCell('A4').value = 'DATE:';
      ws.getCell('A4').font = { name: 'Calibri', size: 10, bold: true };
      ws.getCell('B4').value = plan.diversion_date;
      ws.getCell('B4').font = { name: 'Calibri', size: 10, bold: true };

      ws.getCell('D4').value = 'STATION / ROUTE:';
      ws.getCell('D4').font = { name: 'Calibri', size: 10, bold: true };
      ws.getCell('E4').value = `${plan.work_center_name || plan.work_center} (${plan.route_code || 'CDS'})`;
      ws.getCell('E4').font = { name: 'Calibri', size: 10, bold: true };
      applyBox(4, 1, 4, 2);
      applyBox(4, 4, 4, 5);
      ws.getRow(4).height = 20;

      // Row 5: Blank spacer
      ws.getRow(5).height = 10;

      // Row 6: Card Headers
      ws.mergeCells('A6:B6');
      const a6 = ws.getCell('A6');
      a6.value = 'SOURCE WORK ORDER (DEBIT)';
      a6.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF881337' } };
      a6.alignment = { horizontal: 'center', vertical: 'middle' };
      a6.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };

      ws.mergeCells('D6:E6');
      const d6 = ws.getCell('D6');
      d6.value = 'TARGET WORK ORDER (CREDIT)';
      d6.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF065F46' } };
      d6.alignment = { horizontal: 'center', vertical: 'middle' };
      d6.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      ws.getRow(6).height = 22;

      // Rows 7-11: Source and Target Data with Borders
      const fields = [
        { label: 'WO Number:', sVal: plan.source_wo_no, tVal: plan.target_wo_no, bold: true, size: 11 },
        { label: 'Customer:', sVal: plan.source_customer || 'Standard Stock', tVal: plan.target_customer || 'Standard Stock', bold: false, size: 10 },
        { label: 'Grade:', sVal: plan.source_grade || '', tVal: plan.target_grade || '', bold: true, size: 10 },
        { label: 'Size (OD x WT):', sVal: plan.source_size || '', tVal: plan.target_size || '', bold: true, size: 12, fill: 'FFFFFBEB' },
        { label: 'Heat / Cast No:', sVal: heatNo || '—', tVal: heatNo || '—', bold: true, size: 11 },
      ];

      fields.forEach((f, idx) => {
        const r = 7 + idx;
        ws.getRow(r).height = 20;

        // Source side
        const cA = ws.getCell(r, 1);
        cA.value = f.label;
        cA.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF64748B' } };
        cA.border = thinBorder;

        const cB = ws.getCell(r, 2);
        cB.value = f.sVal;
        cB.font = { name: 'Calibri', size: f.size, bold: f.bold, color: { argb: 'FF0F172A' } };
        if (f.fill) cB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f.fill } };
        cB.border = thinBorder;

        // Target side
        const cD = ws.getCell(r, 4);
        cD.value = f.label;
        cD.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF64748B' } };
        cD.border = thinBorder;

        const cE = ws.getCell(r, 5);
        cE.value = f.tVal;
        cE.font = { name: 'Calibri', size: f.size, bold: f.bold, color: { argb: 'FF0F172A' } };
        if (f.fill) cE.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f.fill } };
        cE.border = thinBorder;
      });

      applyBox(6, 1, 11, 2, darkBorder);
      applyBox(6, 4, 11, 5, darkBorder);

      // Row 12: Spacer
      ws.getRow(12).height = 10;

      // Row 13: Transferred Material Quantities Header
      ws.mergeCells('A13:E13');
      const a13 = ws.getCell('A13');
      a13.value = 'TRANSFERRED MATERIAL QUANTITIES';
      a13.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF312E81' } };
      a13.alignment = { horizontal: 'center', vertical: 'middle' };
      a13.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
      ws.getRow(13).height = 20;

      // Row 14: Subheaders
      const qCols = [
        { col: 1, label: 'Transferred PCS' },
        { col: 2, label: 'Transferred MT' },
        { col: 3, label: 'Transfer Ref' },
        { col: 4, label: 'Transferred MTR' },
        { col: 5, label: 'Multiple Ratio' },
      ];
      ws.getRow(14).height = 18;
      qCols.forEach((q) => {
        const c = ws.getCell(14, q.col);
        c.value = q.label;
        c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        c.border = thinBorder;
      });

      // Row 15: Values
      ws.getRow(15).height = 24;
      const mult = plan.multiple && Number(plan.multiple) > 1 ? Number(plan.multiple) : 1;
      const cutPcs = Math.round(Number(plan.diverted_pcs || 0) * mult);
      v1.value = mult > 1 ? `${cutPcs} PCS (${plan.diverted_pcs} mother × ${mult})` : `${fmt(plan.diverted_pcs, 0)} PCS`;
      v1.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF312E81' } };
      v1.alignment = { horizontal: 'center', vertical: 'middle' };
      v1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
      v1.border = thinBorder;

      const v2 = ws.getCell(15, 2);
      v2.value = `${fmt(plan.diverted_mt)} MT`;
      v2.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF065F46' } };
      v2.alignment = { horizontal: 'center', vertical: 'middle' };
      v2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      v2.border = thinBorder;

      const v3 = ws.getCell(15, 3);
      v3.value = plan.id ? plan.id.slice(0, 8).toUpperCase() : 'TRF-MEMO';
      v3.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      v3.alignment = { horizontal: 'center', vertical: 'middle' };
      v3.border = thinBorder;

      const v4 = ws.getCell(15, 4);
      v4.value = `${fmt(plan.diverted_qty)} M`;
      v4.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF6B21A8' } };
      v4.alignment = { horizontal: 'center', vertical: 'middle' };
      v4.border = thinBorder;

      const v5 = ws.getCell(15, 5);
      v5.value = plan.multiple || 1;
      v5.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      v5.alignment = { horizontal: 'center', vertical: 'middle' };
      v5.border = thinBorder;

      applyBox(13, 1, 15, 5, darkBorder);

      // Row 16: Spacer
      ws.getRow(16).height = 10;

      // Row 17-19: Reason & Engineering Justification Box
      ws.mergeCells('A17:E17');
      const a17 = ws.getCell('A17');
      a17.value = 'REASON & ENGINEERING JUSTIFICATION:';
      a17.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
      a17.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      ws.getRow(17).height = 18;

      ws.mergeCells('A18:E18');
      const a18 = ws.getCell('A18');
      a18.value = plan.reason || 'Immediate delivery prioritization / compatible steel chemistry.';
      a18.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF1E293B' } };
      a18.alignment = { vertical: 'top', wrapText: true };
      ws.getRow(18).height = 32;

      ws.mergeCells('A19:E19');
      const a19 = ws.getCell('A19');
      a19.value = `Authorized By: ${authName}`;
      a19.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      a19.alignment = { vertical: 'middle' };
      a19.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      ws.getRow(19).height = 20;

      applyBox(17, 1, 19, 5, darkBorder);

      // Row 20: Spacer
      ws.getRow(20).height = 12;

      // Row 21-23: Shop Floor Signatures Block
      ws.getCell('A21').value = 'Material Handover (Source)';
      ws.getCell('A21').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF334155' } };
      ws.getCell('A21').alignment = { horizontal: 'center' };
      ws.getCell('A21').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

      ws.mergeCells('B21:C21');
      const bc21 = ws.getCell('B21');
      bc21.value = 'Material Takeover (Target)';
      bc21.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF334155' } };
      bc21.alignment = { horizontal: 'center' };
      bc21.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

      ws.mergeCells('D21:E21');
      const de21 = ws.getCell('D21');
      de21.value = 'PPC Incharge';
      de21.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF334155' } };
      de21.alignment = { horizontal: 'center' };
      de21.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      ws.getRow(21).height = 18;

      // Blank signature box (Row 22)
      ws.getRow(22).height = 36;

      // Signature line (Row 23)
      ws.getCell('A23').value = 'Signature: __________________';
      ws.getCell('A23').font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } };
      ws.getCell('A23').alignment = { horizontal: 'center', vertical: 'bottom' };

      ws.mergeCells('B23:C23');
      const bc23 = ws.getCell('B23');
      bc23.value = 'Signature: __________________';
      bc23.font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } };
      bc23.alignment = { horizontal: 'center', vertical: 'bottom' };

      ws.mergeCells('D23:E23');
      const de23 = ws.getCell('D23');
      de23.value = 'Signature: __________________';
      de23.font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } };
      de23.alignment = { horizontal: 'center', vertical: 'bottom' };
      ws.getRow(23).height = 20;

      applyBox(21, 1, 23, 1, darkBorder);
      applyBox(21, 2, 23, 3, darkBorder);
      applyBox(21, 4, 23, 5, darkBorder);

      // Generate buffer and trigger browser download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Material_Transfer_Memo_${plan.source_wo_no}_to_${plan.target_wo_no}_${plan.diversion_date || 'slip'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Material Transfer Memo exported with formal PDF-style borders.');
    } catch (err: any) {
      toast.error('Failed to export Transfer Memo to Excel: ' + (err?.message || 'Error'));
    }
  };

  return (
    <div className="space-y-6 print:space-y-4 print:p-0">
      {/* Main Report Body - Hidden during individual Transfer Memo printing */}
      <div className={`space-y-6 print:space-y-4 print:p-0 ${selectedPlanForSlip ? 'print:hidden' : ''}`}>
        {/* Screen Toolbar / Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800 border border-purple-200">
              <Shuffle className="h-3.5 w-3.5 text-purple-700" />
              MATERIAL DIVERSION CONTROL
            </span>
            <span className="text-xs font-semibold text-slate-500">Document Ref: RGHS/PPC/DIV-02 (Rev 03)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Material Diversion Issue Order & Circulation Report
          </h1>
          <p className="text-xs text-slate-500">
            Official shop floor material transfer authorizations between work orders across rolling, drawing, annealing, and finishing stations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportScheduleToExcel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-500 transition cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Print / PDF Circulation Sheet
          </button>
        </div>
      </div>

      {/* Printable Formal Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:p-3 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4 print:border-black print:pb-2">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-lg print:border print:border-black">
              RG
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wide text-slate-900 print:text-black">
                RASHMI GREEN HYDROGEN STEEL PVT. LTD.
              </h2>
              <div className="text-xs font-bold text-slate-600 print:text-black uppercase">
                (SEAMLESS DIVISION) · Material Transfer & Diversion Control · PPC
              </div>
              <div className="text-[11px] text-slate-400 print:text-black">
                Material Diversion Issue Authorization & Transfer Memo Schedule
              </div>
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5 print:text-black">
            <div className="font-mono font-bold text-slate-900">DOC: RGHS/PPC/DIV-02</div>
            <div className="text-slate-500">Rev: 03 · Approved</div>
            <div className="text-slate-500 font-mono" suppressHydrationWarning>Date: {todayStr || '—'}</div>
            <div className="text-slate-500">Status: Legally Authorized</div>
          </div>
        </div>

        {/* Filter controls (hidden when printing) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5 print:hidden">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Search WO # / Reason / Approver
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search orders, approver..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Transferred Work Center
            </label>
            <select
              value={workCenterFilter}
              onChange={(e) => setWorkCenterFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Work Centers</option>
              <option value="HOT_ROLLING">Hot Rolling Mill</option>
              <option value="HTC">HTC</option>
              <option value="ROLLING">Rolling Mill (Legacy)</option>
              <option value="HOLLOW_HEAT_TREATMENT">Hollow Heat Treatment</option>
              <option value="DRAW">Cold Draw Bench</option>
              <option value="PILGER">Cold Pilger Mill</option>
              <option value="HEAT_TREATMENT">Final Heat Treatment</option>
              <option value="BAND_SAW">Band Saw Cutting</option>
              <option value="VDI">VDI / QC Inspection</option>
              <option value="FINISHING">Finishing & Inspection</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Process Route
            </label>
            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="ALL">All Process Routes</option>
              {routes.map((r) => (
                <option key={r.id} value={r.route_code}>
                  {r.route_code} — {r.route_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Summary Metric KPI Badges - Focus on PCS and MT */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-100 pt-4 print:border-black print:pt-2">
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 print:bg-white print:border-black">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 print:text-black">
              Total Diversion Orders
            </span>
            <span className="text-lg font-black text-slate-900 font-mono print:text-black">{summary.count}</span>
            <span className="text-[10px] text-purple-600 block print:hidden">PPC Authorized Transfers</span>
          </div>

          {/* Primary Focus Card 1: Total Diverted Pieces (PCS) */}
          <div className="rounded-xl bg-indigo-50/50 p-3 border-2 border-indigo-200 shadow-2xs print:bg-white print:border-black">
            <span className="block text-[10px] font-black uppercase tracking-wider text-indigo-900 print:text-black">
              Total Diverted Pieces (PCS) ★
            </span>
            <div className="mt-1">
              <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-indigo-100 text-indigo-950 border border-indigo-300 print:border-black print:bg-white print:text-black">
                {fmt(summary.totalPcs, 0)} PCS
              </span>
            </div>
            <span className="text-[10px] text-indigo-700 block font-semibold mt-1 print:text-black">
              Total Mother Hollows / Tubes
            </span>
          </div>

          {/* Primary Focus Card 2: Total Diverted Tonnage (MT) */}
          <div className="rounded-xl bg-emerald-50/50 p-3 border-2 border-emerald-200 shadow-2xs print:bg-white print:border-black">
            <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-900 print:text-black">
              Total Diverted Tonnage (MT) ★
            </span>
            <div className="mt-1">
              <span className="inline-block px-2.5 py-0.5 rounded-md text-base sm:text-lg font-black font-mono bg-emerald-100 text-emerald-950 border border-emerald-300 print:border-black print:bg-white print:text-black">
                {fmt(summary.totalMt)} MT
              </span>
            </div>
            <span className="text-[10px] text-emerald-700 block font-semibold mt-1 print:text-black">
              Total Weight Diverted
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 print:bg-white print:border-black">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 print:text-black">
              Total Diverted Meters
            </span>
            <span className="text-lg font-black text-purple-700 font-mono print:text-black">{fmt(summary.totalMtr)} MTR</span>
            <span className="text-[10px] text-slate-500 block mt-1">Linear transfer schedule</span>
          </div>
        </div>
      </div>

      {/* Diversions Schedule Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden print:border-black print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100/90 font-bold uppercase tracking-wider text-slate-700 print:bg-slate-200 print:border-black print:text-black">
                <th className="px-3 py-2.5 whitespace-nowrap">Issue Date</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Transfer Work Center</th>
                <th className="px-3 py-2.5">Source Work Order (From)</th>
                <th className="px-3 py-2.5">Target Work Order (To)</th>

                {/* Primary Focus Columns: PCS and MT */}
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-indigo-950 bg-indigo-100/90 border-l border-indigo-300 print:border-black print:bg-white print:text-black">
                  DIVERTED PCS ★
                </th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap font-black text-emerald-950 bg-emerald-100/90 border-r border-emerald-300 print:border-black print:bg-white print:text-black">
                  WEIGHT (MT) ★
                </th>

                <th className="px-3 py-2.5 text-right whitespace-nowrap">Diverted MTR</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap">Mult</th>
                <th className="px-3 py-2.5">Technical Reason</th>
                <th className="px-3 py-2.5 whitespace-nowrap">Approved By</th>
                <th className="px-3 py-2.5 text-center whitespace-nowrap print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 print:divide-black">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-purple-600" />
                    Loading material diversion orders...
                  </td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500">
                    No material diversion orders found for the selected criteria.
                  </td>
                </tr>
              ) : (
                plans.map((p) => {
                  const wcCfg = WORK_CENTER_LABELS[p.work_center] || {
                    label: p.work_center_name || p.work_center,
                    color: 'bg-slate-100 text-slate-800 border-slate-200',
                  };

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 print:text-black">
                      <td className="px-3 py-2 font-mono whitespace-nowrap font-medium text-slate-900 print:text-black">
                        {p.diversion_date}
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${wcCfg.color} print:border-black print:text-black`}>
                          {wcCfg.label}
                        </span>
                      </td>

                      <td className="px-3 py-2">
                        <div className="font-bold text-rose-800 font-mono print:text-black">{p.source_wo_no}</div>
                        <div className="text-[11px] text-slate-700 print:text-black font-semibold">{p.source_customer || 'Standard Stock'}</div>
                        <div className="text-[10px] text-slate-500 print:text-black font-mono">
                          {p.source_size} · {p.source_grade}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <div className="font-bold text-emerald-800 font-mono print:text-black">{p.target_wo_no}</div>
                        <div className="text-[11px] text-slate-700 print:text-black font-semibold">{p.target_customer || 'Standard Stock'}</div>
                        <div className="text-[10px] text-slate-500 print:text-black font-mono">
                          {p.target_size} · {p.target_grade}
                        </div>
                      </td>

                      {/* Primary Focus Cells: Diverted Pcs (Highlighted, Bold) */}
                      <td className="px-3 py-2 text-right font-mono bg-indigo-50/60 border-l border-indigo-200 print:bg-white print:border-black">
                        <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-indigo-950 bg-indigo-100/90 border border-indigo-300 print:bg-white print:border-black print:text-black">
                          {fmt(
                            p.multiple && Number(p.multiple) > 1
                              ? Number(p.diverted_pcs || 0) * Number(p.multiple)
                              : p.diverted_pcs,
                            0
                          )}
                        </span>
                        {p.multiple && Number(p.multiple) > 1 ? (
                          <div className="text-[10px] text-indigo-600 font-mono print:text-black">
                            ({fmt(p.diverted_pcs, 0)} mother × {p.multiple})
                          </div>
                        ) : null}
                      </td>

                      {/* Primary Focus Cells: Weight MT (Highlighted, Bold) */}
                      <td className="px-3 py-2 text-right font-mono bg-emerald-50/60 border-r border-emerald-200 print:bg-white print:border-black">
                        <span className="inline-block px-2 py-0.5 rounded-md font-black text-xs sm:text-sm text-emerald-950 bg-emerald-100/90 border border-emerald-300 print:bg-white print:border-black print:text-black">
                          {fmt(p.diverted_mt)}
                        </span>
                      </td>

                      <td className="px-3 py-2 text-right font-mono font-bold text-purple-700 print:text-black">
                        {fmt(p.diverted_qty)}
                      </td>

                      <td className="px-3 py-2 text-center font-mono text-slate-600 print:text-black">
                        {p.multiple || 1}
                      </td>

                      <td className="px-3 py-2 max-w-[200px]">
                        <div className="text-slate-800 text-xs line-clamp-2 print:line-clamp-none print:text-black font-medium">
                          {p.reason || 'Compatibility allocation'}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block print:hidden">
                          Route: {p.route_code}
                        </span>
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 print:text-black">{getAuthorisedName(p.approved_by)}</span>
                      </td>

                      <td className="px-3 py-2 text-center whitespace-nowrap print:hidden">
                        <button
                          type="button"
                          onClick={() => setSelectedPlanForSlip(p)}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-50 transition cursor-pointer"
                        >
                          Transfer Memo
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with highlighted PCS and MT */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs flex flex-wrap items-center justify-between font-bold text-slate-800 print:bg-slate-100 print:border-black gap-2">
          <div>
            Total Material Diversions: <span className="font-mono">{plans.length}</span> orders
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-950 font-black text-xs sm:text-sm border border-indigo-300 print:border-black print:bg-white print:text-black">
              TOTAL: {fmt(summary.totalPcs, 0)} PCS
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-950 font-black text-xs sm:text-sm border border-emerald-300 print:border-black print:bg-white print:text-black">
              TOTAL: {fmt(summary.totalMt)} MT
            </span>
            <span className="text-purple-700 font-semibold">Total Length: {fmt(summary.totalMtr)} MTR</span>
          </div>
        </div>
      </div>

      {/* Formal Shop Floor Circulation Sign-Off Block */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs print:border-black print:shadow-none break-inside-avoid">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-4 print:text-black">
          Material Handover & Takeover Shop Floor Sign-Off
        </h3>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Transfer Initiated By</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">PPC Production Planning</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Material Released By</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Source Station Supervisor</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">Material Received By</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Target Station Supervisor</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50 print:bg-white print:border-black">
            <div className="font-bold text-slate-800 print:text-black">QA Metallurgical Clearance</div>
            <div className="text-[11px] text-slate-500 mb-8 print:text-black">Quality Assurance & Lab</div>
            <div className="border-t border-dashed border-slate-300 pt-1 text-[11px] text-slate-400 print:text-black print:border-black">
              Signature & Date
            </div>
          </div>
        </div>
      </div>
      </div>
      {/* End Main Report Body */}

      {/* Individual Transfer Memo Modal */}
      {selectedPlanForSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto print:p-0 print:m-0 print:static print:block print:bg-white print:overflow-visible">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 print:border print:border-black print:rounded-none print:shadow-none print:p-5 print:max-w-none print:w-full print:break-inside-avoid">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-purple-100 text-purple-800 px-2 py-0.5 text-xs font-bold">
                    MATERIAL TRANSFER MEMO
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedPlanForSlip.source_wo_no} → {selectedPlanForSlip.target_wo_no}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPlanForSlip(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Memo Content */}
              <div className="mt-4 space-y-4 text-xs">
                <div className="flex items-start justify-between border-b border-slate-200 pb-3 print:border-black">
                  <div>
                    <h4 className="font-black text-sm uppercase text-slate-900 print:text-black">
                      MATERIAL DIVERSION & INTER-ORDER TRANSFER MEMO
                    </h4>
                    <div className="text-slate-500 print:text-black">Rashmi Green Hydrogen Steel Pvt. Ltd. (Seamless Division) · Shop Floor Circulation Slip</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="font-bold text-slate-900 print:text-black">DATE: {selectedPlanForSlip.diversion_date}</div>
                    <div className="text-slate-500 print:text-black">Station: {selectedPlanForSlip.work_center_name || selectedPlanForSlip.work_center}</div>
                    <div className="text-slate-500 print:text-black">Route: {selectedPlanForSlip.route_code || 'CDS'}</div>
                  </div>
                </div>

                {/* Source & Target Comparison */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 print:bg-white print:border-black">
                    <div className="text-xs font-bold text-rose-900 uppercase tracking-wider mb-2 print:text-black">
                      Source Work Order (Debit)
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <span className="text-slate-500 print:text-black">WO Number: </span>
                        <span className="font-mono font-bold text-slate-900 print:text-black">{selectedPlanForSlip.source_wo_no}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 print:text-black">Customer: </span>
                        <span className="font-semibold text-slate-800 print:text-black">{selectedPlanForSlip.source_customer || 'Standard Stock'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 print:text-black">Grade: </span>
                        <span className="font-mono font-bold text-slate-900 print:text-black">{selectedPlanForSlip.source_grade}</span>
                      </div>
                      <div className="mt-1">
                        <span className="text-slate-500 print:text-black">Size: </span>
                        <span className="font-mono font-black text-sm sm:text-base text-slate-950 print:text-black tracking-wide">
                          {selectedPlanForSlip.source_size}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 print:text-black">Heat / Cast No: </span>
                        <span className="font-mono font-bold text-slate-900 print:text-black">
                          {manualHeatNo || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 print:bg-white print:border-black">
                    <div className="text-xs font-bold text-emerald-900 uppercase tracking-wider mb-2 print:text-black">
                      Target Work Order (Credit)
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <span className="text-slate-500 print:text-black">WO Number: </span>
                        <span className="font-mono font-bold text-slate-900 print:text-black">{selectedPlanForSlip.target_wo_no}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 print:text-black">Customer: </span>
                        <span className="font-semibold text-slate-800 print:text-black">{selectedPlanForSlip.target_customer || 'Standard Stock'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 print:text-black">Grade: </span>
                        <span className="font-mono font-bold text-slate-900 print:text-black">{selectedPlanForSlip.target_grade}</span>
                      </div>
                      <div className="mt-1">
                        <span className="text-slate-500 print:text-black">Size: </span>
                        <span className="font-mono font-black text-sm sm:text-base text-slate-950 print:text-black tracking-wide">
                          {selectedPlanForSlip.target_size}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 print:text-black">Heat / Cast No: </span>
                        <span className="font-mono font-bold text-slate-900 print:text-black">
                          {manualHeatNo || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Material Identification & Editable Heat Number Bar (Screen only - excluded from print as Heat No is printed in cards above) */}
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 print:hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    <div className="flex-1">
                      <label
                        htmlFor="memo-manual-heat-no"
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-950 uppercase tracking-wider mb-1"
                      >
                        <Flame className="h-3.5 w-3.5 text-indigo-600" />
                        <span>Cast / Heat Number (Manual Entry):</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="memo-manual-heat-no"
                          type="text"
                          value={manualHeatNo}
                          onChange={(e) => setManualHeatNo(e.target.value)}
                          placeholder="Type / edit Heat No manually..."
                          className="w-full max-w-sm px-3 py-1.5 text-xs font-mono font-bold text-slate-900 bg-white border border-indigo-300 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <span className="text-[11px] text-slate-500 italic whitespace-nowrap">
                          (Editable - mirrors to cards above)
                        </span>
                      </div>
                    </div>

                    <div className="flex sm:flex-col sm:items-end justify-between text-xs font-mono text-slate-600">
                      <div>
                        Route: <strong className="text-slate-900">{selectedPlanForSlip.route_code || 'CDS'}</strong>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Transfer Ref: <span className="font-semibold">{selectedPlanForSlip.id ? selectedPlanForSlip.id.slice(0, 8).toUpperCase() : 'TRF-MEMO'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Transferred Quantities - Focus on PCS and MT */}
                <div className="grid grid-cols-4 gap-3 rounded-lg border border-slate-200 p-3 bg-slate-50 print:bg-white print:border-black font-mono text-center">
                  <div className="rounded-md bg-indigo-50 border border-indigo-200 p-2 print:bg-white print:border-black">
                    <span className="text-indigo-900 text-[10px] block uppercase font-bold print:text-black">Transferred Pcs ★</span>
                    <span className="text-lg font-black text-indigo-950 print:text-black">
                      {fmt(
                        selectedPlanForSlip.multiple && Number(selectedPlanForSlip.multiple) > 1
                          ? Number(selectedPlanForSlip.diverted_pcs || 0) * Number(selectedPlanForSlip.multiple)
                          : selectedPlanForSlip.diverted_pcs,
                        0
                      )}{' '}
                      PCS
                    </span>
                    {selectedPlanForSlip.multiple && Number(selectedPlanForSlip.multiple) > 1 ? (
                      <span className="text-[10px] text-indigo-600 block font-mono print:text-black">
                        ({fmt(selectedPlanForSlip.diverted_pcs, 0)} mother × {selectedPlanForSlip.multiple})
                      </span>
                    ) : null}
                  </div>
                  <div className="rounded-md bg-emerald-50 border border-emerald-200 p-2 print:bg-white print:border-black">
                    <span className="text-emerald-900 text-[10px] block uppercase font-bold print:text-black">Transferred MT ★</span>
                    <span className="text-lg font-black text-emerald-950 print:text-black">{fmt(selectedPlanForSlip.diverted_mt)} MT</span>
                  </div>
                  <div className="rounded-md bg-white border border-slate-200 p-2 print:bg-white print:border-black">
                    <span className="text-slate-500 text-[10px] block uppercase font-bold print:text-black">Transferred MTR</span>
                    <span className="text-base font-black text-purple-700 print:text-black">{fmt(selectedPlanForSlip.diverted_qty)} M</span>
                  </div>
                  <div className="rounded-md bg-white border border-slate-200 p-2 print:bg-white print:border-black">
                    <span className="text-slate-500 text-[10px] block uppercase font-bold print:text-black">Multiple Ratio</span>
                    <span className="text-base font-black text-slate-900 print:text-black">{selectedPlanForSlip.multiple || 1}</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 bg-white print:border-black">
                  <span className="text-slate-500 block text-[11px] font-bold uppercase mb-1 print:text-black">
                    Reason & Engineering Justification:
                  </span>
                  <p className="text-slate-800 text-xs font-medium print:text-black">
                    {selectedPlanForSlip.reason || 'Immediate delivery prioritization / compatible steel chemistry.'}
                  </p>
                  <div className="mt-2 text-[11px] text-slate-500 font-mono print:text-black">
                    Authorized By: <span className="font-bold text-slate-900 print:text-black">{getAuthorisedName(selectedPlanForSlip.approved_by)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200 print:border-black">
                  <div>
                    <div className="text-slate-500 text-[10px] print:text-black">Material Handover (Source):</div>
                    <div className="border-b border-slate-300 mt-6 print:border-black"></div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px] print:text-black">Material Takeover (Target):</div>
                    <div className="border-b border-slate-300 mt-6 print:border-black"></div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px] print:text-black">PPC Incharge:</div>
                    <div className="border-b border-slate-300 mt-6 print:border-black"></div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 print:hidden border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedPlanForSlip(null)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => exportMemoToExcel(selectedPlanForSlip, manualHeatNo)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer shadow-2xs active:scale-95"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                  Export Excel Memo
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 transition cursor-pointer shadow-xs active:scale-95"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Transfer Memo
                </button>
              </div>
            </div>
          </div>
      )}
    </div>
  );
}
