const SUPA_URL = process.env.SUPABASE_URL || 'https://yprwklxolgrlyswqwkzr.supabase.co';
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcndrbHhvbGdybHlzd3F3a3pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDE5MjUsImV4cCI6MjA5NjIxNzkyNX0.Or_pWAg1QuJ3TSVLdC8LKzp1PsYwTxcAfy_YcSAU2ZA';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appB4LCctwYvuxK5S';
const TABLE_ID = 'tblkdiwaGP5e5xAot';

function escapeAirtableString(value) {
  return String(value).replace(/'/g, "''");
}

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!AIRTABLE_TOKEN) return res.status(500).json({ error: 'Server not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const producer = await getProducerFromToken(token);
  if (!producer) return res.status(403).json({ error: 'Producer profile required' });

  try {
    const producerEsc = escapeAirtableString(producer);
    const formula = `AND({Producer}="${producerEsc}", OR({Select}="New", {Select}="Review", {Select}="Pending"))`;
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });
    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: errText, status: response.status });
    }
    const data = await response.json();
    const pending = (data.records || []).map(r => ({
      id: r.id,
      title: r.fields['TItle'] || r.fields['Title'] || 'Untitled',
      submittedAt: r.createdTime ? new Date(r.createdTime).getTime() : Date.now()
    }));
    return res.status(200).json({ pending });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
