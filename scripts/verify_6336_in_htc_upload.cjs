const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\HTC Data UPLOAD.xlsx';
const wb = xlsx.readFile(file);
const sheet = wb.Sheets['Sheet3'];
const raw = xlsx.utils.sheet_to_json(sheet);

console.log('Total raw rows in Sheet3:', raw.length);

// Let's inspect all rows that have work_order_no === '6336'
const rows6336 = raw.filter(r => String(r['WORK ORDER NO.'] || r['W.O.NO.'] || '').trim() === '6336');
console.log('Total rows for 6336 in HTC Data UPLOAD.xlsx:', rows6336.length);

let totalPcs6336 = 0;
let totalMtr6336 = 0;
rows6336.forEach((r, i) => {
  const htcPcs = Number(r['HTC OK PCS'] || 0);
  const htcMtr = Number(r['HTC OK MTR'] || 0);
  totalPcs6336 += htcPcs;
  totalMtr6336 += htcMtr;
  console.log(`  Row ${i+1}: Date=${r['DATE']}, HTC PCS=${htcPcs}, HTC MTR=${htcMtr}, Gross PCS=${r['Rolled Gross (Pcs)']}, Gross MTR=${r['Rolled Gross (MTR)']}`);
});

console.log(`Total 6336 Planned HTC: ${totalPcs6336} PCS / ${totalMtr6336.toFixed(2)} MTR`);
