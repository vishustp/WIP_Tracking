const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\HTC Data UPLOAD.xlsx';
const wb = xlsx.readFile(file);
const sheet = wb.Sheets['Sheet3'];
const raw = xlsx.utils.sheet_to_json(sheet);

function findColumn(headers, candidates) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const c of candidates) {
    const target = norm(c);
    const found = headers.find((h) => norm(h) === target);
    if (found) return found;
  }
  for (const c of candidates) {
    const target = norm(c);
    const found = headers.find((h) => norm(h).includes(target));
    if (found) return found;
  }
  return undefined;
}

const headers = Object.keys(raw[0]);
const cWO = findColumn(headers, ['WORK ORDER NO.', 'WORK ORDER NO', 'Work Order No', 'Work Order #', 'WO No', 'WO #', 'WorkOrder', 'W.O. NO.', 'W.O.NO.', 'W.O.No', 'W.O. No.', 'W.O NO.', 'W.O NO', 'W.O.', 'W.O', 'W.NO.', 'W.NO', 'W/O No.', 'W/O No', 'W/O', 'WO']);
const cDate = findColumn(headers, ['Date', 'Process Date', 'Rolling Date', 'Mfg Date', 'DATE', 'Grinding Date', 'GRINDING DATE']);
const cShift = findColumn(headers, ['Shift', 'SHIFT', 'Shift Code', 'Working Shift']);
const cHeatLot = findColumn(headers, ['HEAT NO.', 'HEAT NO', 'Heat No', 'Heat No.', 'Heat / Lot No', 'Heat / Lot', 'Heat Number', 'Lot No', 'Heat Lot No', 'Heat/Lot No', 'HEAT', 'H.NO.', 'H.NO']);
const cL1 = findColumn(headers, ['L1', 'Length 1', 'Cut Length 1', 'Min Length', 'Length', 'LENGTH']);
const cL2 = findColumn(headers, ['L2', 'Length 2', 'Cut Length 2', 'Max Length']);
const cOutPcs = findColumn(headers, ['Rolled Gross Pcs', 'Rolled Gross', 'ROLLED GROSS', 'Gross Pcs', 'Gross', 'Rolled Gross (Pcs)', 'Output Pcs', 'Output PCS', 'OUTPUT PCS', 'OK', 'OK Pcs']);
const cOutMtr = findColumn(headers, ['Rolled Gross Mtr', 'ROLLED GROSS MTR', 'Rolled Gross (Mtr)', 'Gross Mtr', 'Rolled Gross (MTR)', 'Output Mtr', 'Output MTR', 'OUTPUT MTR', 'OK Mtr']);
const cHtcPcs = findColumn(headers, ['HTC OK PCS', 'HTC OK Pcs', 'HTC OK Pcs.', 'HTC OK', 'HTC Pcs', 'Hollow OK Pcs', 'Rolling OK Pcs', 'HTC_OK_PCS', 'HTC_OK']);
const cHtcMtr = findColumn(headers, ['HTC OK MTR', 'HTC OK Mtr', 'HTC OK Mtr.', 'HTC Mtr', 'Hollow OK Mtr', 'Rolling OK Mtr', 'HTC_OK_MTR']);
const cRejPcs = findColumn(headers, ['Reject', 'REJECT', 'Rejection', 'REJECTION', 'Rejection Pcs', 'Rejection PCS', 'Reject Pcs']);
const cRejMtr = findColumn(headers, ['Reject Mtr', 'REJECT MTR', 'Rejection Mtr', 'Rejection MTR', 'Rej Mtr']);
const cScrapMT = findColumn(headers, ['TOTAL MT', 'Total MT', 'Total Mt', 'Scrap MT', 'Scrap Mt']);
const cBundle = findColumn(headers, ['Bundle No', 'Bundle No.', 'Bundle Number', 'Bundle #', 'Lot Bundle', 'B. NO.', 'B.NO.', 'B.NO']);
const cDefectReason = findColumn(headers, ['Defect Reason', 'DEFECT REASON', 'Defect', 'Reason']);
const cSalvage = findColumn(headers, ['SALVAGE', 'Salvage', 'Salvage Pcs']);

let validCount = 0;
let invalidCount = 0;
const invalidRows = [];

raw.forEach((r, idx) => {
  const wo = String(r[cWO] || '').trim();
  const outPcs = Number(r[cOutPcs] || 0);
  const outMtr = Number(r[cOutMtr] || 0);
  const htcPcs = Number(r[cHtcPcs] || 0);
  const htcMtr = Number(r[cHtcMtr] || 0);
  const rejPcs = Number(r[cRejPcs] || 0);
  const rejMtr = Number(r[cRejMtr] || 0);

  const errors = [];
  if (!wo) errors.push('Work Order No missing');
  if (outPcs <= 0 && outMtr <= 0 && htcPcs <= 0 && htcMtr <= 0 && rejPcs <= 0 && rejMtr <= 0) {
    errors.push('Production Output/HTC OK quantity missing');
  }
  if (outPcs > 0 || outMtr > 0 || htcPcs > 0 || htcMtr > 0) {
    if (htcPcs <= 0 && htcMtr <= 0 && rejPcs <= 0 && rejMtr <= 0) {
      errors.push('Rolling requires HTC OK Pcs or Mtr > 0');
    }
  }

  if (errors.length > 0) {
    invalidCount++;
    invalidRows.push({ row: idx + 1, wo, errors: errors.join(', '), record: r });
  } else {
    validCount++;
  }
});

console.log(`Valid rows: ${validCount}, Invalid rows: ${invalidCount}`);
if (invalidRows.length > 0) {
  console.log('Sample invalid rows:', invalidRows.slice(0, 10));
}
