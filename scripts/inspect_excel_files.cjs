const xlsx = require('xlsx');
const fs = require('fs');

const files = [
  'C:\\Users\\Kallol Bera\\Downloads\\HTC - May 25-1 (7).xlsx',
  'C:\\Users\\Kallol Bera\\Downloads\\Seamless_Pipe_ROLLING_Template(1).xlsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    console.log('=== FILE:', file, '===');
    const wb = xlsx.readFile(file);
    console.log('Sheet Names:', wb.SheetNames);
    wb.SheetNames.forEach(sheetName => {
      const sheet = wb.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      console.log(`Sheet "${sheetName}" total rows:`, data.length);
      console.log('First 3 rows:', data.slice(0, 3));
    });
  }
});
