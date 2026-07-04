import { fetchPortfolioSitemapEntries } from './_portfolio.js';
import { getServiceRoleKey } from './_env.js';

const SITE_URL = 'https://beatswipe.app';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  if (!getServiceRoleKey()) return res.status(500).send('Server not configured');

  try {
    const entries = await fetchPortfolioSitemapEntries();
    const urls = [
      { loc: SITE_URL, priority: '1.0', changefreq: 'weekly' },
      ...entries.map(e => ({ loc: e.loc, priority: '0.8', changefreq: 'weekly' }))
    ];
    const body = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    return res.status(200).send(xml);
  } catch (e) {
    return res.status(500).send(e.message);
  }
}
