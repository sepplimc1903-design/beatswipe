import {
  getUserFromToken,
  getProducerFromUserId,
  fetchProducerStats
} from './_stats.js';
import { getServiceRoleKey } from './_env.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!getServiceRoleKey()) return res.status(500).json({ error: 'Server not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const user = await getUserFromToken(token);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  const producer = await getProducerFromUserId(user.id, token);
  if (!producer) return res.status(403).json({ error: 'Producer profile required' });

  try {
    const stats = await fetchProducerStats(producer);
    return res.status(200).json(stats);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not load stats' });
  }
}
