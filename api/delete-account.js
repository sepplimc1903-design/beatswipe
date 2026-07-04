import { getServiceRoleKey, getSupabaseUrl, getSupabaseAnonKey } from './_env.js';
import { serviceHeaders } from './_portfolio.js';

async function getUserFromToken(token) {
  const anon = getSupabaseAnonKey();
  if (!anon || !token) return null;
  const url = getSupabaseUrl();
  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon }
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  return user?.id ? user : null;
}

async function getProfile(userId, token) {
  const anon = getSupabaseAnonKey();
  const url = getSupabaseUrl();
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${userId}&select=id,producer_name,avatar_url&limit=1`,
    { headers: { Authorization: `Bearer ${token}`, apikey: anon, Accept: 'application/json' } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

function storagePathFromUrl(fileUrl, bucket) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const re = new RegExp(`/storage/v1/object/public/${bucket}/([^?]+)`);
  const m = fileUrl.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

async function deleteStorageObject(bucket, objectPath) {
  if (!objectPath) return;
  const url = getSupabaseUrl();
  await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: 'DELETE',
    headers: serviceHeaders()
  });
}

async function removeProducerBeats(producer) {
  if (!producer) return;
  const base = getSupabaseUrl();
  const beatsRes = await fetch(
    `${base}/rest/v1/beats?producer=eq.${encodeURIComponent(producer)}&select=id,preview_url,status`,
    { headers: serviceHeaders(), cache: 'no-store' }
  );
  if (!beatsRes.ok) {
    const err = await beatsRes.text();
    throw new Error(err || 'Could not load beats');
  }
  const beats = await beatsRes.json();
  for (const beat of beats) {
    const path = storagePathFromUrl(beat.preview_url, 'beats');
    if (path) await deleteStorageObject('beats', path);
  }
  await fetch(
    `${base}/rest/v1/beats?producer=eq.${encodeURIComponent(producer)}`,
    { method: 'DELETE', headers: serviceHeaders('return=minimal') }
  );
}

async function deleteAuthUser(userId) {
  const url = getSupabaseUrl();
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: serviceHeaders()
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Could not delete auth user');
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

  const user = await getUserFromToken(token);
  if (!user?.id) return res.status(401).json({ error: 'Invalid session' });

  const profile = await getProfile(user.id, token);
  const producer = profile?.producer_name?.trim() || null;
  const base = getSupabaseUrl();

  try {
    await fetch(`${base}/rest/v1/crates?user_id=eq.${user.id}`, {
      method: 'DELETE',
      headers: serviceHeaders('return=minimal')
    });

    if (producer) await removeProducerBeats(producer);

    await deleteStorageObject('avatars', `${user.id}.jpg`);
    await deleteStorageObject('avatars', `${user.id}.png`);

    await fetch(`${base}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'DELETE',
      headers: serviceHeaders('return=minimal')
    });

    await deleteAuthUser(user.id);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Account deletion failed' });
  }
}
