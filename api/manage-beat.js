import { getServiceRoleKey, getSupabaseUrl, getSupabaseAnonKey } from './_env.js';

function serviceHeaders(prefer) {
  const key = getServiceRoleKey();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
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

async function getBeatRow(beatId) {
  const res = await fetch(
    `${getSupabaseUrl()}/rest/v1/beats?id=eq.${encodeURIComponent(beatId)}&select=id,producer,status&limit=1`,
    { headers: serviceHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function patchBeat(beatId, fields) {
  const res = await fetch(
    `${getSupabaseUrl()}/rest/v1/beats?id=eq.${encodeURIComponent(beatId)}`,
    {
      method: 'PATCH',
      headers: serviceHeaders('return=minimal'),
      body: JSON.stringify(fields)
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Update failed');
  }
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

  const { action, beatId, fields } = req.body || {};
  if (!beatId) return res.status(400).json({ error: 'beatId required' });

  const row = await getBeatRow(beatId);
  if (!row) return res.status(404).json({ error: 'Beat not found' });
  if ((row.producer || '').trim() !== producer) {
    return res.status(403).json({ error: 'Not your beat' });
  }

  try {
    if (action === 'delete') {
      await patchBeat(beatId, { status: 'removed' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'update') {
      const f = fields || {};
      const updates = {};
      if (f.title != null && String(f.title).trim()) {
        updates.title = String(f.title).trim();
      }
      if (f.genre != null) updates.genre = String(f.genre).trim();
      if (f.type != null) updates.type = String(f.type).trim();
      if (f.key != null) updates.key = String(f.key).trim();
      if (f.buy != null) updates.buy_link = String(f.buy).trim();
      if (f.bpm != null && f.bpm !== '') {
        const bpmNum = parseFloat(f.bpm);
        if (!Number.isNaN(bpmNum)) updates.bpm = bpmNum;
      }
      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      await patchBeat(beatId, updates);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
