const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\HTC Data UPLOAD.xlsx';
const wb = xlsx.readFile(file);
const sheet = wb.Sheets['Sheet3'];
const raw = xlsx.utils.sheet_to_json(sheet);

raw.forEach((r, idx) => {
  const wo = String(r['WORK ORDER NO.'] || r['W.O.NO.'] || '').trim();
  if (['6336', '6215', '5887', '5886', '6261', '6191', '4380'].includes(wo)) {
    console.log(`Row ${idx + 1}: WO ${wo}, Date: ${r['DATE']}, HTC OK PCS: ${r['HTC OK PCS']}, HTC OK MTR: ${r['HTC OK MTR']}`);
  }
});
