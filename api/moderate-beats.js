import { getServiceRoleKey, getSupabaseUrl, isAdminEmail } from './_env.js';
import { getUserFromToken } from './_stats.js';

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

function beatFromRow(row) {
  const bpmNum = row.bpm != null ? parseFloat(row.bpm) : NaN;
  return {
    id: row.id,
    producer: row.producer || 'Unknown',
    title: row.title || 'Untitled',
    genre: row.genre || 'Other',
    type: row.type || 'Full Beat',
    bpm: !Number.isNaN(bpmNum) && bpmNum > 0 ? bpmNum : null,
    key: row.key || 'N/A',
    previewType: row.preview_type || '',
    previewUrl: row.preview_url || '',
    buyLink: row.buy_link || '',
    color: row.color || '#BA7517',
    createdAt: row.created_at || null
  };
}

async function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Unauthorized', status: 401 };
  const user = await getUserFromToken(token);
  if (!user?.id) return { error: 'Invalid session', status: 401 };
  if (!isAdminEmail(user.email)) return { error: 'Forbidden', status: 403 };
  return { user };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!getServiceRoleKey()) return res.status(500).json({ error: 'Server not configured' });

  const auth = await requireAdmin(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    if (req.method === 'GET') {
      const dbRes = await fetch(
        `${getSupabaseUrl()}/rest/v1/beats?status=eq.pending&select=id,producer,title,genre,type,bpm,key,preview_type,preview_url,buy_link,color,created_at&order=created_at.asc`,
        { headers: serviceHeaders(), cache: 'no-store' }
      );
      const text = await dbRes.text();
      if (!dbRes.ok) {
        return res.status(500).json({ error: text || 'Could not load pending beats', status: dbRes.status });
      }
      const rows = JSON.parse(text || '[]');
      const pending = rows.map(beatFromRow);
      return res.status(200).json({ pending, count: pending.length });
    }

    if (req.method === 'POST') {
      const { action, beatId } = req.body || {};
      if (!beatId) return res.status(400).json({ error: 'beatId required' });
      if (action !== 'approve' && action !== 'reject') {
        return res.status(400).json({ error: 'action must be approve or reject' });
      }

      const rowRes = await fetch(
        `${getSupabaseUrl()}/rest/v1/beats?id=eq.${encodeURIComponent(beatId)}&select=id,status&limit=1`,
        { headers: serviceHeaders(), cache: 'no-store' }
      );
      if (!rowRes.ok) return res.status(500).json({ error: 'Could not load beat' });
      const rows = await rowRes.json();
      const row = rows[0];
      if (!row) return res.status(404).json({ error: 'Beat not found' });
      if (row.status !== 'pending') {
        return res.status(409).json({ error: 'Beat is no longer pending' });
      }

      const status = action === 'approve' ? 'approved' : 'rejected';
      const patchRes = await fetch(
        `${getSupabaseUrl()}/rest/v1/beats?id=eq.${encodeURIComponent(beatId)}`,
        {
          method: 'PATCH',
          headers: serviceHeaders('return=minimal'),
          body: JSON.stringify({ status })
        }
      );
      if (!patchRes.ok) {
        const errText = await patchRes.text();
        return res.status(500).json({ error: errText || 'Update failed' });
      }
      return res.status(200).json({ ok: true, status });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
