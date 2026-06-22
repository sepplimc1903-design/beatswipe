import { getServiceRoleKey, getSupabaseUrl, getSupabaseAnonKey } from './_env.js';

function serviceHeaders() {
  const key = getServiceRoleKey();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

async function getProducerFromToken(token) {
  const anon = getSupabaseAnonKey();
  if (!anon) return null;
  const url = getSupabaseUrl();
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon }
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const profRes = await fetch(
    `${url}/rest/v1/profiles?id=eq.${user.id}&select=producer_name&limit=1`,
    { headers: { Authorization: `Bearer ${token}`, apikey: anon, Accept: 'application/json' } }
  );
  if (!profRes.ok) return null;
  const rows = await profRes.json();
  return rows[0]?.producer_name?.trim() || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!getServiceRoleKey()) return res.status(500).json({ error: 'Server not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const producer = await getProducerFromToken(token);
  if (!producer) return res.status(403).json({ error: 'Producer profile required' });

  const body = req.body || {};
  const title = String(body.title || body.Title || '').trim();
  const genre = String(body.genre || body.Genre || '').trim();
  const type = String(body.type || body.Type || '').trim();
  const previewType = String(body.previewType || body.PreviewType || '').trim();
  const previewUrl = String(body.previewUrl || body.PreviewURL || '').trim();
  const buyLink = String(body.buyLink || body.BuyLink || '').trim();
  const key = String(body.key || body.Key || '').trim();
  const bpmRaw = body.bpm ?? body.BPM;
  const bpmNum = bpmRaw != null && bpmRaw !== '' ? parseFloat(bpmRaw) : null;

  if (!title) return res.status(400).json({ error: 'Title required' });
  if (!genre || !type) return res.status(400).json({ error: 'Genre and type required' });
  if (!previewType) return res.status(400).json({ error: 'Preview type required' });
  if (!previewUrl) return res.status(400).json({ error: 'Preview URL required' });

  const row = {
    producer,
    title,
    genre,
    type,
    preview_type: previewType,
    preview_url: previewUrl,
    buy_link: buyLink,
    key: key || 'N/A',
    status: 'pending',
    color: '#BA7517'
  };
  if (bpmNum != null && !Number.isNaN(bpmNum) && bpmNum > 0) row.bpm = bpmNum;

  try {
    const dbRes = await fetch(`${getSupabaseUrl()}/rest/v1/beats`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify(row)
    });
    const text = await dbRes.text();
    if (!dbRes.ok) {
      return res.status(dbRes.status >= 400 && dbRes.status < 500 ? dbRes.status : 500).json({
        error: text || 'Could not submit beat',
        status: dbRes.status
      });
    }
    const inserted = JSON.parse(text || '[]');
    const beat = Array.isArray(inserted) ? inserted[0] : inserted;
    return res.status(200).json({
      ok: true,
      id: beat?.id,
      title: beat?.title || title
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
