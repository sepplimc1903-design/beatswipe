const SUPA_URL = process.env.SUPABASE_URL || 'https://yprwklxolgrlyswqwkzr.supabase.co';
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcndrbHhvbGdybHlzd3F3a3pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDE5MjUsImV4cCI6MjA5NjIxNzkyNX0.Or_pWAg1QuJ3TSVLdC8LKzp1PsYwTxcAfy_YcSAU2ZA';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appB4LCctwYvuxK5S';
const TABLE_ID = 'tblkdiwaGP5e5xAot';

async function getProducerFromToken(token) {
  if (!SUPA_KEY) return null;
  const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPA_KEY }
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const profRes = await fetch(
    `${SUPA_URL}/rest/v1/profiles?id=eq.${user.id}&select=producer_name&limit=1`,
    { headers: { Authorization: `Bearer ${token}`, apikey: SUPA_KEY, Accept: 'application/json' } }
  );
  if (!profRes.ok) return null;
  const rows = await profRes.json();
  return rows[0]?.producer_name?.trim() || null;
}

async function getBeatRecord(beatId) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${beatId}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
  });
  if (!res.ok) return null;
  return res.json();
}

async function patchBeat(beatId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${beatId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Airtable update failed');
  }
  return res.json();
}

async function deleteBeatRecord(beatId) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${beatId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Airtable delete failed');
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!AIRTABLE_TOKEN) return res.status(500).json({ error: 'Server not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const producer = await getProducerFromToken(token);
  if (!producer) return res.status(403).json({ error: 'Producer profile required' });

  const { action, beatId, fields } = req.body || {};
  if (!beatId) return res.status(400).json({ error: 'beatId required' });

  const record = await getBeatRecord(beatId);
  if (!record) return res.status(404).json({ error: 'Beat not found' });
  if ((record.fields.Producer || '').trim() !== producer) {
    return res.status(403).json({ error: 'Not your beat' });
  }

  try {
    if (action === 'delete') {
      try {
        await patchBeat(beatId, { Select: 'Removed' });
      } catch (_) {
        await deleteBeatRecord(beatId);
      }
      return res.status(200).json({ ok: true });
    }

    if (action === 'update') {
      const f = fields || {};
      const airtableFields = {};
      if (f.title != null && String(f.title).trim()) {
        airtableFields.TItle = String(f.title).trim();
        airtableFields.Title = String(f.title).trim();
      }
      if (f.genre != null) airtableFields.Genre = String(f.genre).trim();
      if (f.type != null) airtableFields.Type = String(f.type).trim();
      if (f.key != null) airtableFields.Key = String(f.key).trim();
      if (f.buy != null) airtableFields['Buy Link'] = String(f.buy).trim();
      if (f.bpm != null && f.bpm !== '') {
        const bpmNum = parseFloat(f.bpm);
        if (!Number.isNaN(bpmNum)) airtableFields.BPM = bpmNum;
      }
      if (!Object.keys(airtableFields).length) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      await patchBeat(beatId, airtableFields);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
