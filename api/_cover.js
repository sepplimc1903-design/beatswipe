import { getServiceRoleKey, getSupabaseUrl } from './_env.js';

export function normalizeCoverUrl(raw, supabaseUrl) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const base = String(supabaseUrl || '').replace(/\/$/, '');
  if (!base) return '';
  const clean = v.split('?')[0];
  const prefix = base + '/storage/v1/object/public/';
  if (!clean.startsWith(prefix)) return '';
  const rest = clean.slice(prefix.length);
  if (
    rest.startsWith('covers/')
    || rest.startsWith('beats/cover-')
    || rest.startsWith('beats/covers/')
    || rest.startsWith('avatars/covers/')
  ) return clean;
  return '';
}

const COVER_BUCKET = 'covers';
const MAX_BYTES = 2 * 1024 * 1024;
let _bucketReady = false;

function storageHeaders(json) {
  const key = getServiceRoleKey();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {})
  };
}

async function ensureCoversBucket() {
  if (_bucketReady) return true;
  const url = getSupabaseUrl();
  const headers = storageHeaders(true);
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
    const existing = await fetch(`${url}/storage/v1/bucket/${COVER_BUCKET}`, { headers: storageHeaders() });
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

export async function storeCoverImage(userId, mimeRaw, imageRaw) {
  const mime = String(mimeRaw || 'image/jpeg').toLowerCase();
  const allowed = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const ext = allowed[mime];
  if (!ext) return { status: 400, error: 'Use a JPG, PNG, or WebP image.' };

  const raw = String(imageRaw || '').replace(/^data:image\/\w+;base64,/, '');
  if (!raw) return { status: 400, error: 'Cover image missing' };
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch (e) {
    return { status: 400, error: 'Could not read that image.' };
  }
  if (!buf.length) return { status: 400, error: 'Cover image missing' };
  if (buf.length > MAX_BYTES) return { status: 400, error: 'Cover must be under 2 MB.' };

  const ready = await ensureCoversBucket();
  const bucket = ready ? COVER_BUCKET : 'avatars';
  const fileName = ready
    ? `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    : `covers/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const upload = await fetch(`${getSupabaseUrl()}/storage/v1/object/${bucket}/${fileName}`, {
    method: 'POST',
    headers: {
      ...storageHeaders(),
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
      return { status: 415, error: 'Image type not allowed in storage. Try PNG, or create a public covers bucket.' };
    }
    return { status: 500, error: errMsg };
  }

  return {
    status: 200,
    url: `${getSupabaseUrl()}/storage/v1/object/public/${bucket}/${fileName}`
  };
}

export function coverStorageTarget(coverUrl) {
  const v = String(coverUrl || '');
  const m = v.match(/\/storage\/v1\/object\/public\/(covers|beats|avatars)\/([^?]+)/);
  if (!m) return null;
  const path = decodeURIComponent(m[2]);
  if (m[1] === 'beats' && !path.startsWith('cover-') && !path.startsWith('covers/')) return null;
  if (m[1] === 'avatars' && !path.startsWith('covers/')) return null;
  return { bucket: m[1], path };
}
