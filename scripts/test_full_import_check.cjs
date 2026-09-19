const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\Seamless_Pipe_ROLLING_Template(1).xlsx';
const wb = xlsx.readFile(file);
const sheet = wb.Sheets['Rolling Mill'];
const records = xlsx.utils.sheet_to_json(sheet);

console.log('Total records in Excel:', records.length);

// Let's inspect unique work orders and their counts
const woCounts = {};
records.forEach(r => {
  const wo = String(r['Work Order No'] || '').trim();
  woCounts[wo] = (woCounts[wo] || 0) + 1;
});

console.log('WO Counts:', woCounts);
