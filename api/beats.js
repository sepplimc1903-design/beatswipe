import { getServiceRoleKey, getSupabaseUrl } from './_env.js';

function serviceHeaders() {
  const key = getServiceRoleKey();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    Accept: 'application/json'
  };
}

function beatFromRow(row) {
  const bpmNum = row.bpm != null ? parseFloat(row.bpm) : NaN;
  return {
    id: row.id,
    title: row.title || 'Untitled',
    producer: row.producer || 'Unknown',
    type: row.type || 'Full Beat',
    bpm: !Number.isNaN(bpmNum) && bpmNum > 0 ? `${bpmNum} BPM` : '--- BPM',
    key: row.key || 'N/A',
    genre: row.genre || 'Other',
    color: row.color || '#BA7517',
    mp3: row.preview_url || '',
    buy: row.buy_link || ''
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, s-maxage=45, stale-while-revalidate=60');

  if (!getServiceRoleKey()) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const dbRes = await fetch(
      `${getSupabaseUrl()}/rest/v1/beats?status=eq.approved&select=id,producer,title,genre,type,bpm,key,preview_url,buy_link,color&order=created_at.asc`,
      { headers: serviceHeaders(), cache: 'no-store' }
    );
    const text = await dbRes.text();
    if (!dbRes.ok) {
      return res.status(500).json({ error: text || 'Could not load beats', status: dbRes.status });
    }
    const rows = JSON.parse(text || '[]');
    const beats = rows.map(beatFromRow);
    return res.status(200).json({ beats });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
