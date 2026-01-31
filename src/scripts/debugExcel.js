
import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const TARGET_FILENAME = 'プロ仕様ガトーショコラ専門レシピ集.xlsx';

async function debugFile() {
    const filePath = path.join(PROJECT_ROOT, TARGET_FILENAME);
    console.log(`Inspecting ${filePath}...`);

    try {
        const fileBuffer = await fs.readFile(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

        for (const sheetName of workbook.SheetNames) {
            console.log(`\n=== Sheet: ${sheetName} ===`);
            const worksheet = workbook.Sheets[sheetName];

            // Get raw JSON array of arrays (rows)
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            // Print first 20 rows to see structure
            rows.slice(0, 20).forEach((row, i) => {
                console.log(`Row ${i}:`, JSON.stringify(row));
            });
        }
    } catch (e) {
        console.error("Error reading file:", e);
    }
}

debugFile();
