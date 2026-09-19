const xlsx = require('xlsx');

const file = 'C:\\Users\\Kallol Bera\\Downloads\\HTC Data UPLOAD.xlsx';
const wb = xlsx.readFile(file);
console.log('Sheet Names in HTC Data UPLOAD.xlsx:', wb.SheetNames);

wb.SheetNames.forEach(sheetName => {
  const sheet = wb.Sheets[sheetName];
  const records = xlsx.utils.sheet_to_json(sheet);
  console.log(`\n=== Sheet "${sheetName}" ===`);
  console.log('Total records:', records.length);
  if (records.length > 0) {
    console.log('First record:', records[0]);
    const headers = Object.keys(records[0]);
    console.log('Headers:', headers);
    
    // Check 6336
    const rows6336 = records.filter(r => {
      return Object.values(r).some(v => String(v).includes('6336'));
    });
    console.log('Rows containing 6336:', rows6336.length);
    if (rows6336.length > 0) {
      console.log('Sample 6336 row:', rows6336[0]);
    }
  }
});
