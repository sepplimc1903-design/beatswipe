import { getServiceRoleKey, getSupabaseUrl } from './_env.js';
import { resolveSoundCloudTrackUrl, needsSoundCloudResolve } from './_soundcloud.js';

const BEAT_SELECT = 'id,producer,title,genre,type,bpm,key,preview_url,buy_link,color,cover_url';
const BEAT_SELECT_NO_COVER = 'id,producer,title,genre,type,bpm,key,preview_url,buy_link,color';

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
    buy: row.buy_link || '',
    cover: row.cover_url || ''
  };
}

async function fetchApprovedBeats(headers) {
  const url = getSupabaseUrl();
  const qs = status => `${url}/rest/v1/beats?status=eq.approved&select=${status}&order=created_at.asc`;
  let dbRes = await fetch(qs(BEAT_SELECT), { headers, cache: 'no-store' });
  if (!dbRes.ok) {
    const text = await dbRes.text();
    if (/cover_url/i.test(text)) {
      dbRes = await fetch(qs(BEAT_SELECT_NO_COVER), { headers, cache: 'no-store' });
    } else {
      return { ok: false, text, status: dbRes.status };
    }
  }
  if (!dbRes.ok) {
    const text = await dbRes.text();
    return { ok: false, text, status: dbRes.status };
  }
  return { ok: true, rows: JSON.parse(await dbRes.text() || '[]') };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');

  if (!getServiceRoleKey()) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const loaded = await fetchApprovedBeats(serviceHeaders());
    if (!loaded.ok) {
      return res.status(500).json({ error: loaded.text || 'Could not load beats', status: loaded.status });
    }
    const rows = loaded.rows || [];
    const beats = await Promise.all(rows.map(async row => {
      const beat = beatFromRow(row);
      if (needsSoundCloudResolve(beat.mp3)) {
        const resolved = await resolveSoundCloudTrackUrl(beat.mp3);
        if (resolved) beat.mp3 = resolved;
      }
      return beat;
    }));
    return res.status(200).json({ beats });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
