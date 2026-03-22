
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
console.log('pdf import:', pdf);

const files = ['シフォンケーキ10選.pdf'];

async function readPdfs() {
    for (const file of files) {
        if (fs.existsSync(file)) {
            console.log(`\n--- Reading ${file} ---`);
            const dataBuffer = fs.readFileSync(file);
            const data = await pdf(dataBuffer);
            console.log(data.text);
            console.log(`\n--- End of ${file} ---`);
        } else {
            console.log(`File not found: ${file}`);
        }
    }
}

readPdfs();
