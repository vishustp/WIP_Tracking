const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const dir = 'C:\\Users\\Kallol Bera\\Downloads';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx'));

files.forEach(f => {
  const p = path.join(dir, f);
  const stat = fs.statSync(p);
  console.log(`File: ${f}, Size: ${stat.size} bytes, Modified: ${stat.mtime}`);
  try {
    const wb = xlsx.readFile(p);
    console.log(`  Sheets: ${wb.SheetNames.join(', ')}`);
  } catch (e) {
    console.log(`  Error reading: ${e.message}`);
  }
});
