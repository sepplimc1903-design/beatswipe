import { fetchPortfolioMetaBySlug } from './_portfolio.js';
import { getServiceRoleKey } from './_env.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!getServiceRoleKey()) return res.status(500).json({ error: 'Server not configured' });

  const slug = String(req.query?.slug || '').trim();
  if (!slug) return res.status(400).json({ error: 'slug required' });

  try {
    const meta = await fetchPortfolioMetaBySlug(slug);
    if (!meta) return res.status(404).json({ error: 'Producer not found' });
    return res.status(200).json(meta);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
