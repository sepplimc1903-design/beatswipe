import { fetchPortfolioMetaBySlug, escapeHtml } from './_portfolio.js';
import { getServiceRoleKey } from './_env.js';

function buildOgHtml(meta) {
  const title = escapeHtml(meta.title);
  const desc = escapeHtml(meta.description);
  const url = escapeHtml(meta.url);
  const image = escapeHtml(meta.image);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${image}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${image}">
  <meta http-equiv="refresh" content="0;url=${url}">
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: meta.title,
    description: meta.description,
    url: meta.url,
    mainEntity: {
      '@type': 'MusicGroup',
      name: meta.producerName,
      url: meta.url,
      ...(meta.image ? { image: meta.image } : {})
    }
  })}</script>
</head>
<body>
  <p><a href="${url}">${title}</a></p>
  <script>location.replace(${JSON.stringify(meta.url)});</script>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  if (!getServiceRoleKey()) return res.status(500).send('Server not configured');

  const slug = String(req.query?.slug || '').trim();
  if (!slug) return res.status(400).send('slug required');

  try {
    const meta = await fetchPortfolioMetaBySlug(slug);
    if (!meta) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(buildOgHtml(meta));
  } catch (e) {
    return res.status(500).send(e.message);
  }
}
