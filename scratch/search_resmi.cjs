const ExcelJS = require('exceljs');

async function dumpSheets() {
  try {
    const workbook = new ExcelJS.Workbook();
    const filePath = '/home/spil/Documents/Teyd/Project/2026/goenakan.id/admin-goenakan.id/docs/superpowers/Hitungan harga quotation.xlsx';
    await workbook.xlsx.readFile(filePath);
    
    for (const name of ['import freight', 'lokal']) {
      console.log(`\n=== SHEET: ${name} ===`);
      const sheet = workbook.getWorksheet(name);
      if (!sheet) {
        console.log("Not found");
        continue;
      }
      sheet.eachRow((row, rowNumber) => {
        const values = row.values.map(v => {
          if (v && typeof v === 'object' && v.result !== undefined) {
            return `${v.result} (Formula: ${v.formula})`;
          }
          return v;
        });
        if (values.some(v => v !== null && v !== undefined && v !== '')) {
          console.log(`Row ${rowNumber}:`, JSON.stringify(values.slice(1)));
        }
      });
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

dumpSheets();
