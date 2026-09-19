const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\Seamless_Pipe_ROLLING_Template(1).xlsx';
const wb = xlsx.readFile(file);
const sheet = wb.Sheets['Rolling Mill'];
const records = xlsx.utils.sheet_to_json(sheet);

const rows6336 = records.filter(r => String(r['Work Order No'] || '').trim() === '6336');
console.log('Sample rows for 6336:');
console.log(rows6336.slice(0, 5));
