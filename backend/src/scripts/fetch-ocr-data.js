/**
 * One-time download of the Tesseract English language model used for receipt OCR.
 * Run:  node src/scripts/fetch-ocr-data.js
 *
 * This saves eng.traineddata.gz into backend/lang-data/ so OCR works offline
 * and doesn't re-download on every server start.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = path.join(__dirname, '..', '..', 'lang-data');
const DEST = path.join(DIR, 'eng.traineddata.gz');
const URL = 'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0/eng.traineddata.gz';

fs.mkdirSync(DIR, { recursive: true });

if (fs.existsSync(DEST) && fs.statSync(DEST).size > 1000000) {
  console.log('Language data already present at', DEST);
  process.exit(0);
}

console.log('Downloading Tesseract English data…');
const file = fs.createWriteStream(DEST);
https.get(URL, (res) => {
  if (res.statusCode !== 200) {
    console.error('Download failed, status', res.statusCode);
    process.exit(1);
  }
  res.pipe(file);
  file.on('finish', () => file.close(() => console.log('Saved to', DEST)));
}).on('error', (err) => {
  fs.unlink(DEST, () => {});
  console.error('Download error:', err.message);
  process.exit(1);
});