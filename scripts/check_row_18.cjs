const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\HTC Data UPLOAD.xlsx';
const wb = xlsx.readFile(file);
const sheet = wb.Sheets['Sheet3'];
const raw = xlsx.utils.sheet_to_json(sheet);

const rows6336 = raw.filter(r => String(r['WORK ORDER NO.'] || r['W.O.NO.'] || '').trim() === '6336');
console.log('Row 18 full content:', rows6336[17]);
