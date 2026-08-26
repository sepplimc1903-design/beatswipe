import { getServiceRoleKey, getSupabaseUrl, getSupabaseAnonKey } from './_env.js';

const COVER_BUCKET = 'covers';
const MAX_BYTES = 2 * 1024 * 1024;
let _bucketReady = false;

function serviceHeaders() {
  const key = getServiceRoleKey();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    Accept: 'application/json'
  };
}

async function getUserFromToken(token) {
  const anon = getSupabaseAnonKey();
  if (!anon || !token) return null;
  const userRes = await fetch(`${getSupabaseUrl()}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anon }
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  return user?.id ? user : null;
}

async function ensureCoversBucket() {
  if (_bucketReady) return true;
  const url = getSupabaseUrl();
  const headers = { ...serviceHeaders(), 'Content-Type': 'application/json' };
  const payload = {
    public: true,
    file_size_limit: MAX_BYTES,
    allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp']
  };
  const create = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: COVER_BUCKET, name: COVER_BUCKET, ...payload })
  });
  const createText = await create.text();
  const created = create.ok || create.status === 409 || /already exists|duplicate/i.test(createText);
  if (!created) {
    const existing = await fetch(`${url}/storage/v1/bucket/${COVER_BUCKET}`, { headers: serviceHeaders() });
    if (!existing.ok) return false;
  }
  await fetch(`${url}/storage/v1/bucket/${COVER_BUCKET}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });
  _bucketReady = true;
  return true;
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

  const mime = String(req.body?.mime || 'image/jpeg').toLowerCase();
  const allowed = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const ext = allowed[mime];
  if (!ext) return res.status(400).json({ error: 'Use a JPG, PNG, or WebP image.' });

  const raw = String(req.body?.image || '').replace(/^data:image\/\w+;base64,/, '');
  if (!raw) return res.status(400).json({ error: 'Cover image missing' });
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'Could not read that image.' });
  }
  if (!buf.length) return res.status(400).json({ error: 'Cover image missing' });
  if (buf.length > MAX_BYTES) return res.status(400).json({ error: 'Cover must be under 2 MB.' });

  const ready = await ensureCoversBucket();
  const bucket = ready ? COVER_BUCKET : 'avatars';
  const fileName = ready
    ? `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    : `covers/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const upload = await fetch(`${getSupabaseUrl()}/storage/v1/object/${bucket}/${fileName}`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(),
      'Content-Type': mime,
      'x-upsert': 'true',
      'Cache-Control': '3600'
    },
    body: buf
  });
  if (!upload.ok) {
    const errText = await upload.text();
    let errMsg = errText || 'Cover upload failed';
    try {
      const parsed = JSON.parse(errText);
      errMsg = parsed.message || parsed.error || errMsg;
    } catch (e) {}
    if (/mime|not supported/i.test(errMsg)) {
      return res.status(415).json({ error: 'Image type not allowed in storage. Try PNG, or create a public “covers” bucket.' });
    }
    return res.status(500).json({ error: errMsg });
  }

  const publicUrl = `${getSupabaseUrl()}/storage/v1/object/public/${bucket}/${fileName}`;
  return res.status(200).json({ ok: true, url: publicUrl });
}
