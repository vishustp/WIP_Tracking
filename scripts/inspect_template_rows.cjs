const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\Seamless_Pipe_ROLLING_Template(1).xlsx';
const wb = xlsx.readFile(file);
const sheet = wb.Sheets['Rolling Mill'];
const records = xlsx.utils.sheet_to_json(sheet);

console.log('Total records:', records.length);
console.log('First record:', records[0]);

const wos = new Set(records.map(r => String(r['Work Order No'] || '').trim()));
console.log('Unique Work Orders in file (' + wos.size + '):', Array.from(wos).slice(0, 20));
console.log('Does file contain 6336?', wos.has('6336'));
console.log('Records for 6336:', records.filter(r => String(r['Work Order No'] || '').trim() === '6336').length);
