import {
  resolveProducerName,
  isValidEventType,
  insertPortfolioEvent
} from './_stats.js';
import { getServiceRoleKey } from './_env.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!getServiceRoleKey()) return res.status(500).json({ error: 'Server not configured' });

  const body = req.body || {};
  const type = String(body.type || body.event_type || '').trim();
  const beatId = body.beatId ?? body.beat_id ?? null;

  if (!isValidEventType(type)) {
    return res.status(400).json({ error: 'Invalid event type' });
  }

  try {
    const producer = await resolveProducerName(body.producer);
    if (!producer) return res.status(404).json({ error: 'Producer not found' });

    await insertPortfolioEvent(producer, type, beatId);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Track failed' });
  }
}
