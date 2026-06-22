import { getServiceRoleKey, getSupabaseUrl, getSupabaseAnonKey } from './_env.js';

function serviceHeaders() {
  const key = getServiceRoleKey();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    Accept: 'application/json'
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!getServiceRoleKey()) return res.status(500).json({ error: 'Server not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const producer = await getProducerFromToken(token);
  if (!producer) return res.status(403).json({ error: 'Producer profile required' });

  try {
    const dbRes = await fetch(
      `${getSupabaseUrl()}/rest/v1/beats?producer=eq.${encodeURIComponent(producer)}&status=eq.pending&select=id,title,created_at&order=created_at.desc`,
      { headers: serviceHeaders(), cache: 'no-store' }
    );
    const text = await dbRes.text();
    if (!dbRes.ok) {
      return res.status(500).json({ error: text || 'Could not load pending beats', status: dbRes.status });
    }
    const rows = JSON.parse(text || '[]');
    const pending = rows.map(r => ({
      id: r.id,
      title: r.title || 'Untitled',
      submittedAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    }));
    return res.status(200).json({ pending });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
