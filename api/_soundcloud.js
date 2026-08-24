export function looksLikeSoundCloudUrl(url) {
  return /soundcloud\.com|snd\.sc\//i.test(String(url || ''));
}

export function needsSoundCloudResolve(url) {
  const u = String(url || '').toLowerCase();
  return /on\.soundcloud\.com|m\.soundcloud\.com|snd\.sc\/|w\.soundcloud\.com/.test(u)
    && !/api\.soundcloud\.com\/tracks\//i.test(u);
}

export function extractSoundCloudUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  const iframe = s.match(/src=["']([^"']+)["']/i);
  if (iframe) s = iframe[1].replace(/&amp;/g, '&');
  s = s.replace(/^<|>$/g, '').trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/\//, '');
  try {
    const u = new URL(s);
    if (/w\.soundcloud\.com$/i.test(u.hostname) && u.searchParams.get('url')) {
      return extractSoundCloudUrl(u.searchParams.get('url'));
    }
    ['si', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref', 'in'].forEach(k => {
      u.searchParams.delete(k);
    });
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch (_) {
    return s;
  }
}

function trackUrlFromOembedHtml(html) {
  const src = String(html || '').match(/\ssrc=["']([^"']+)["']/i);
  if (!src) return '';
  try {
    const player = new URL(src[1].replace(/&amp;/g, '&'));
    return player.searchParams.get('url') || '';
  } catch (_) {
    return '';
  }
}

function isCanonicalSoundCloudTrack(url) {
  try {
    const u = new URL(url);
    if (!/^(www\.)?soundcloud\.com$/i.test(u.hostname)) return false;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return false;
    const blocked = new Set(['you', 'discover', 'stream', 'feed', 'search', 'pages', 'signin', 'settings']);
    return !blocked.has(parts[0].toLowerCase());
  } catch (_) {
    return false;
  }
}

export async function resolveSoundCloudTrackUrl(raw) {
  const extracted = extractSoundCloudUrl(raw);
  if (!looksLikeSoundCloudUrl(extracted)) return null;
  try {
    const res = await fetch(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(extracted)}`,
      { headers: { Accept: 'application/json' }, redirect: 'follow' }
    );
    if (res.ok) {
      const data = await res.json();
      const nested = trackUrlFromOembedHtml(data.html);
      if (nested) return nested;
    }
  } catch (_) {}
  if (isCanonicalSoundCloudTrack(extracted)) return extracted;
  return null;
}
