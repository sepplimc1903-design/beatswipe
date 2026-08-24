const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const igDir = path.join(dir, 'ig');
const html = path.join(dir, 'posts.html');

(async () => {
  fs.mkdirSync(igDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 3240 },
    deviceScaleFactor: 2,
  });
  await page.goto('file://' + html, { waitUntil: 'networkidle' });

  const names = [
    ['post-1', '01-slogan'],
    ['post-2', '02-product'],
    ['post-3', '03-cta'],
  ];

  for (const [id, file] of names) {
    const loc = page.locator('#' + id);
    await loc.screenshot({ path: path.join(dir, file + '.png'), type: 'png' });
    await loc.screenshot({
      path: path.join(igDir, file + '.jpg'),
      type: 'jpeg',
      quality: 92,
    });
    console.log('wrote', file);
  }

  await browser.close();
})();
