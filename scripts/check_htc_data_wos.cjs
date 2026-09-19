const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\HTC Data UPLOAD.xlsx';
const wb = xlsx.readFile(file);
const sheet = wb.Sheets['Sheet3'];
const raw = xlsx.utils.sheet_to_json(sheet);

const woMap = {};
raw.forEach((r, idx) => {
  const wo = String(r['WORK ORDER NO.'] || r['W.O.NO.'] || '').trim();
  woMap[wo] = (woMap[wo] || 0) + 1;
});

console.log('Work orders in HTC Data UPLOAD.xlsx (total rows ' + raw.length + '):');
console.log(woMap);
