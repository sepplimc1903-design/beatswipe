import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'marketing', 'og-image.html');
const outPath = path.join(root, 'og-image.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
await page.screenshot({ path: outPath, type: 'png' });
await browser.close();
console.log('Wrote', outPath);
