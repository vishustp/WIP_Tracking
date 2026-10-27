const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const os = require('os');

function extractPcsFromRemarks(remarks) {
  if (!remarks) return { pcs: null };
  const match = remarks.match(/(\d+)\s*PCS/i) || remarks.match(/(\d+)\s*Nos/i) || remarks.match(/Pieces:\s*(\d+)/i) || remarks.match(/(\d+)\s*pc/i);
  return { pcs: match ? parseInt(match[1], 10) : null };
}

function mtFromMtr(mtr, od, wt) {
  if (!mtr || !od || !wt || od <= wt) return 0;
  return Number(((od - wt) * wt * 0.0246615 * 0.001 * mtr).toFixed(3));
}

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

async function generateEnhancedExcel() {
  const rawPath = path.resolve(__dirname, 'october_rolling_raw.json');
  const plansPath = path.resolve(__dirname, 'rolling_plans_raw.json');

  const logs = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const plans = JSON.parse(fs.readFileSync(plansPath, 'utf8'));

  // Build mother hollow lookup map from rolling plans
  const mhMap = new Map();
  for (const p of plans) {
    try {
      const parsed = typeof p.status === 'string' ? JSON.parse(p.status) : p.status;
      const mhOd = Number(p.mh_od || parsed?.mh_od || parsed?.cust_od || parsed?.sm?.cust_od || 0) || null;
      const mhWt = Number(p.mh_wt || parsed?.mh_wt || parsed?.cust_wt || parsed?.sm?.rolling_wt || 0) || null;
      const mhL1 = Number(p.mh_l1 || parsed?.mh_l1 || parsed?.sm?.sm_len || 0) || null;
      const mhL2 = Number(p.mh_l2 || parsed?.mh_l2 || parsed?.sm?.sm_len || 0) || null;
      const mhAvg = mhL1 && mhL2 ? (mhL1 + mhL2) / 2 : mhL1 || mhL2 || null;

      const info = { mh_od: mhOd, mh_wt: mhWt, mh_l1: mhL1, mh_l2: mhL2, mh_avg_length: mhAvg };
      if (p.work_order_id) mhMap.set(p.work_order_id, info);
      if (parsed?.master_wo_id) mhMap.set(parsed.master_wo_id, info);
      if (parsed?.is_master && Array.isArray(parsed?.child_work_orders)) {
        for (const c of parsed.child_work_orders) {
          const cId = c.work_order_id || c.id;
          if (cId) mhMap.set(cId, info);
        }
      }
    } catch {}
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Seamless WIP Tracking System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('October 2026 Rolling', {
    views: [{ state: 'frozen', ySplit: 6 }]
  });

  // 1. Header Banner
  worksheet.mergeCells('A1:N1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'RASHMI GREEN HYDROGEN STEEL PVT. LTD. — SEAMLESS TUBE DIVISION';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells('A2:N2');
  const subTitleCell = worksheet.getCell('A2');
  subTitleCell.value = 'HOT ROLLING MILL PRODUCTION REPORT — OCTOBER 2026';
  subTitleCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1D4ED8' } };
  subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 22;

  worksheet.mergeCells('A3:N3');
  const metaCell = worksheet.getCell('A3');
  metaCell.value = 'Note: Column K shows Actual Rolled Mother Hollow Weight (used on Dashboard). Column M shows Finished Pipe Weight (after Cold Drawing).';
  metaCell.font = { name: 'Calibri', size: 9.5, italic: true, bold: true, color: { argb: 'FFB45309' } }; // Amber-700
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Amber-100
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(3).height = 20;

  worksheet.getRow(4).height = 4;

  // 2. Table Column Headers
  const columns = [
    { header: 'SL No.', width: 7 },
    { header: 'Process Date', width: 13 },
    { header: 'Shift', width: 10 },
    { header: 'Work Order #', width: 15 },
    { header: 'Customer Name', width: 26 },
    { header: 'Grade / Specification', width: 22 },
    { header: 'Rolled MH OD (mm)', width: 15 },
    { header: 'Rolled MH WT (mm)', width: 15 },
    { header: 'Rolled Nos (PCS)', width: 15 },
    { header: 'Rolled Length (m)', width: 16 },
    { header: 'Rolled Weight [MH] (MT) ★ (Dashboard)', width: 23 },
    { header: 'Finished Size (OD × WT mm)', width: 20 },
    { header: 'Finished Weight [Cust] (MT)', width: 21 },
    { header: 'Remarks / Heat Lot / Operator', width: 32 },
  ];

  const headerRow = worksheet.getRow(5);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };

    // Highlight Column K (Dashboard Rolled MT) with special gold/amber-orange fill
    if (idx === 10) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }; // Amber-600
    } else if (idx === 6 || idx === 7 || idx === 8) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Blue-600
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; // Blue-800
    }

    cell.alignment = {
      horizontal: idx >= 6 && idx <= 12 ? 'right' : 'center',
      vertical: 'middle',
      wrapText: true
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
    worksheet.getColumn(idx + 1).width = col.width;
  });
  headerRow.height = 32;

  let grandTotalMhPcs = 0;
  let grandTotalMtr = 0;
  let grandTotalMhMt = 0;
  let grandTotalCustMt = 0;

  logs.forEach((log, idx) => {
    const wo = log.work_orders || {};
    const planMh = mhMap.get(log.work_order_id);

    const custOd = Number(wo.size_od || 0);
    const custWt = Number(wo.size_wt || 0);
    const mhOd = planMh?.mh_od ? Number(planMh.mh_od) : custOd;
    const mhWt = planMh?.mh_wt ? Number(planMh.mh_wt) : custWt;

    const mtr = Number(log.output_qty || 0);

    const { pcs: pPcs } = extractPcsFromRemarks(log.remarks);
    const avgLenMh = Number(planMh?.mh_avg_length || planMh?.mh_l1 || 4.49);
    const pcs = pPcs !== null && pPcs > 0 ? pPcs : (mtr > 0 && avgLenMh > 0 ? Math.round(mtr / avgLenMh) : 0);

    const mhMt = mtFromMtr(mtr, mhOd, mhWt);
    const custMt = mtFromMtr(mtr, custOd, custWt);

    grandTotalMhPcs += pcs;
    grandTotalMtr += mtr;
    grandTotalMhMt += mhMt;
    grandTotalCustMt += custMt;

    const rowNum = idx + 6;
    const row = worksheet.getRow(rowNum);
    const isEven = idx % 2 === 0;
    const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    const rowValues = [
      idx + 1,
      log.process_date || '',
      log.shift || 'General',
      wo.work_order_no || '—',
      wo.customer_name || 'Standard Order',
      wo.specification || wo.grade || '—',
      mhOd > 0 ? mhOd : '—',
      mhWt > 0 ? mhWt : '—',
      pcs,
      Number(mtr.toFixed(2)),
      Number(mhMt.toFixed(3)),
      custOd > 0 && custWt > 0 ? `${custOd} × ${custWt}` : '—',
      Number(custMt.toFixed(3)),
      log.remarks ? log.remarks.replace(/\r?\n|\r/g, ' ') : (log.operator_name || '—')
    ];

    rowValues.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (cIdx === 0 || cIdx === 2) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (cIdx === 1) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (cIdx === 3) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF1D4ED8' } };
      } else if (cIdx === 10) {
        // Rolled Mother Hollow Weight (Dashboard)
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.000';
        cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFB45309' } }; // Amber-700
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Light amber
      } else if (cIdx === 8) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0';
        cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
      } else if (cIdx === 9) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
        cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF1E40AF' } };
      } else if (cIdx === 12) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.000';
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF64748B' } };
      } else if (cIdx === 6 || cIdx === 7) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
      } else if (cIdx === 11) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });

    row.height = 20;
  });

  // Summary Row
  const totalRowNum = logs.length + 6;
  const totalRow = worksheet.getRow(totalRowNum);

  totalRow.getCell(1).value = '';
  totalRow.getCell(2).value = '';
  totalRow.getCell(3).value = '';
  totalRow.getCell(4).value = 'TOTAL';
  totalRow.getCell(5).value = `Total ${logs.length} Rolling Batches`;
  totalRow.getCell(6).value = '';
  totalRow.getCell(7).value = '';
  totalRow.getCell(8).value = '';
  totalRow.getCell(9).value = grandTotalMhPcs;
  totalRow.getCell(10).value = Number(grandTotalMtr.toFixed(2));
  totalRow.getCell(11).value = Number(grandTotalMhMt.toFixed(3));
  totalRow.getCell(12).value = '';
  totalRow.getCell(13).value = Number(grandTotalCustMt.toFixed(3));
  totalRow.getCell(14).value = '';

  for (let c = 1; c <= 14; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
    if (c === 9) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.numFmt = '#,##0';
    } else if (c === 10) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.numFmt = '#,##0.00';
    } else if (c === 11) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.numFmt = '#,##0.000';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE047' } }; // Brighter gold
    } else if (c === 13) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.numFmt = '#,##0.000';
    } else if (c === 4) {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }
  totalRow.height = 25;

  const fileName = 'Total_Rolling_Production_October_2026.xlsx';
  const detailedName = 'Total_Rolling_October_2026_Detailed.xlsx';
  const workspacePath = path.resolve(__dirname, '..', fileName);
  const workspaceDetailedPath = path.resolve(__dirname, '..', detailedName);
  const downloadsDetailedPath = path.join(os.homedir(), 'Downloads', detailedName);

  await workbook.xlsx.writeFile(workspaceDetailedPath);
  console.log(`Updated Excel file in workspace: ${workspaceDetailedPath}`);

  try {
    await workbook.xlsx.writeFile(workspacePath);
  } catch {}

  try {
    await workbook.xlsx.writeFile(downloadsDetailedPath);
    console.log(`Updated Excel file in Downloads: ${downloadsDetailedPath}`);
  } catch (e) {
    console.log(`Could not write to Downloads: ${e.message}`);
  }
}

generateEnhancedExcel().catch(console.error);
