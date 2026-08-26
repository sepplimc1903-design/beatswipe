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

export function coverStorageTarget(coverUrl) {
  const v = String(coverUrl || '');
  const m = v.match(/\/storage\/v1\/object\/public\/(covers|beats|avatars)\/([^?]+)/);
  if (!m) return null;
  const path = decodeURIComponent(m[2]);
  if (m[1] === 'beats' && !path.startsWith('cover-') && !path.startsWith('covers/')) return null;
  if (m[1] === 'avatars' && !path.startsWith('covers/')) return null;
  return { bucket: m[1], path };
}
