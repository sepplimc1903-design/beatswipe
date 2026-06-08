const SUPA_URL = process.env.SUPABASE_URL || 'https://yprwklxolgrlyswqwkzr.supabase.co';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcndrbHhvbGdybHlzd3F3a3pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDE5MjUsImV4cCI6MjA5NjIxNzkyNX0.Or_pWAg1QuJ3TSVLdC8LKzp1PsYwTxcAfy_YcSAU2ZA';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';

async function getUserFromToken(userToken) {
  if (!userToken || !SUPA_ANON) return null;
  const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${userToken}`, apikey: SUPA_ANON }
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  return user?.id ? user : null;
}

function restHeaders(prefer, userToken) {
  if (SUPA_SERVICE) {
    return {
      Authorization: `Bearer ${SUPA_SERVICE}`,
      apikey: SUPA_SERVICE,
      Accept: 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    };
  }
  return {
    Authorization: `Bearer ${userToken}`,
    apikey: SUPA_ANON,
    Accept: 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

function beatFromRow(row) {
  const raw = row?.beat_data;
  if (!raw) return null;
  if (typeof raw === 'object' && raw.id) return raw;
  if (typeof raw === 'string') {
    try {
      const beat = JSON.parse(raw);
      return beat?.id ? beat : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function postCrateRow(userId, beat, userToken) {
  const payloads = [
    { user_id: userId, beat_id: beat.id, beat_data: beat },
    { user_id: userId, beat_id: beat.id, beat_data: JSON.stringify(beat) }
  ];
  const urls = [
    `${SUPA_URL}/rest/v1/crates?on_conflict=user_id,beat_id`,
    `${SUPA_URL}/rest/v1/crates`
  ];
  let lastStatus = 500;
  let lastError = 'Save failed';

  for (const payload of payloads) {
    for (const url of urls) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...restHeaders('resolution=merge-duplicates,return=minimal', userToken),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) return { ok: true };
      lastStatus = res.status;
      lastError = await res.text().catch(() => 'Save failed');
      if (lastStatus !== 400 && lastStatus !== 404 && lastStatus !== 409) break;
    }
    if (lastStatus !== 400 && lastStatus !== 404 && lastStatus !== 409) break;
  }

  return { ok: false, status: lastStatus, error: lastError };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!userToken) return res.status(401).json({ error: 'Unauthorized' });

  const user = await getUserFromToken(userToken);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  try {
    if (req.method === 'GET') {
      const dbRes = await fetch(
        `${SUPA_URL}/rest/v1/crates?user_id=eq.${user.id}&select=beat_id,beat_data,created_at&order=created_at.asc`,
        { headers: restHeaders(null, userToken), cache: 'no-store' }
      );
      const text = await dbRes.text();
      if (!dbRes.ok) {
        return res.status(dbRes.status).json({
          error: text || 'Could not load favorites',
          status: dbRes.status,
          hint: dbRes.status === 403 && !SUPA_SERVICE
            ? 'Add SUPABASE_SERVICE_ROLE_KEY to Vercel / .env.local, or add RLS policies on crates'
            : undefined
        });
      }
      const rows = JSON.parse(text || '[]');
      const beats = [];
      rows.forEach(row => {
        const beat = beatFromRow(row);
        if (beat && !beats.find(b => b.id === beat.id)) beats.push(beat);
      });
      return res.status(200).json({ beats });
    }

    if (req.method === 'POST') {
      const { beat } = req.body || {};
      if (!beat?.id) return res.status(400).json({ error: 'beat with id required' });

      const result = await postCrateRow(user.id, beat, userToken);
      if (!result.ok) {
        return res.status(result.status || 500).json({
          error: result.error || 'Could not save favorite',
          status: result.status,
          hint: result.status === 403 && !SUPA_SERVICE
            ? 'Add SUPABASE_SERVICE_ROLE_KEY to Vercel / .env.local, or add RLS policies on crates'
            : undefined
        });
      }
      return res.status(200).json({ ok: true, beat_id: beat.id });
    }

    if (req.method === 'DELETE') {
      const beatId = req.query?.beat_id;
      if (!beatId) return res.status(400).json({ error: 'beat_id required' });

      const dbRes = await fetch(
        `${SUPA_URL}/rest/v1/crates?user_id=eq.${user.id}&beat_id=eq.${encodeURIComponent(beatId)}`,
        { method: 'DELETE', headers: restHeaders(null, userToken) }
      );
      if (!dbRes.ok) {
        const errText = await dbRes.text().catch(() => '');
        return res.status(dbRes.status).json({
          error: errText || 'Could not remove favorite',
          status: dbRes.status
        });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
