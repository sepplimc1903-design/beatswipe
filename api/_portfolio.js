import { getServiceRoleKey, getSupabaseUrl } from './_env.js';

const SITE_URL = 'https://beatswipe.app';
const DEFAULT_OG = `${SITE_URL}/og-image.png`;

export function slugFromProducerName(name) {
  return encodeURIComponent(String(name).trim().toLowerCase().replace(/\s+/g, '-'));
}

export function normSlug(s) {
  return String(s).toLowerCase().replace(/[\s_-]+/g, '');
}

export function producerMatchesSlug(producerName, slug) {
  if (!producerName || !slug) return false;
  let decoded = slug;
  try { decoded = decodeURIComponent(slug); } catch (_) {}
  const target = normSlug(decoded);
  return normSlug(producerName) === target
    || slugFromProducerName(producerName).toLowerCase() === decoded.toLowerCase();
}

export function serviceHeaders(prefer) {
  const key = getServiceRoleKey();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    Accept: 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function fetchApprovedProducers() {
  const res = await fetch(
    `${getSupabaseUrl()}/rest/v1/beats?status=eq.approved&select=producer`,
    { headers: serviceHeaders(), cache: 'no-store' }
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return [...new Set(rows.map(r => r.producer).filter(Boolean))];
}

async function fetchProfiles() {
  const res = await fetch(
    `${getSupabaseUrl()}/rest/v1/profiles?select=producer_name,bio,avatar_url&producer_name=not.is.null`,
    { headers: serviceHeaders(), cache: 'no-store' }
  );
  if (!res.ok) return [];
  return res.json();
}

export function isDemoPortfolioSlug(slug) {
  if (!slug) return false;
  let decoded = String(slug);
  try { decoded = decodeURIComponent(decoded); } catch (_) {}
  return normSlug(decoded) === 'demo';
}

export function getDemoPortfolioMeta() {
  return {
    title: 'Demo – BeatSwipe',
    description: 'Sample swipe page — this is what fans see from a bio link on beatswipe.app.',
    image: DEFAULT_OG,
    url: `${SITE_URL}/p/demo`,
    producerName: 'Demo',
    slug: 'demo'
  };
}

export async function fetchPortfolioMetaBySlug(slug) {
  if (!slug) return null;
  if (isDemoPortfolioSlug(slug)) return getDemoPortfolioMeta();
  if (!getServiceRoleKey()) return null;

  const profiles = await fetchProfiles();
  let profile = profiles.find(p => producerMatchesSlug(p.producer_name, slug));

  if (!profile) {
    const producers = await fetchApprovedProducers();
    const producerName = producers.find(p => producerMatchesSlug(p, slug));
    if (!producerName) return null;
    profile = profiles.find(p => p.producer_name === producerName)
      || { producer_name: producerName, bio: '', avatar_url: null };
  }

  const bio = (profile.bio || '').trim()
    || 'Swipe through beats, save favorites, buy directly from the producer.';
  const title = `${profile.producer_name} – BeatSwipe`;
  const pageSlug = slugFromProducerName(profile.producer_name);
  const image = (profile.avatar_url && profile.avatar_url.startsWith('http'))
    ? profile.avatar_url
    : DEFAULT_OG;

  return {
    title,
    description: bio,
    image,
    url: `${SITE_URL}/p/${pageSlug}`,
    producerName: profile.producer_name,
    slug: pageSlug
  };
}

export async function fetchPortfolioSitemapEntries() {
  const demo = [{ loc: `${SITE_URL}/p/demo`, name: 'demo' }];
  if (!getServiceRoleKey()) return demo;
  const producers = await fetchApprovedProducers();
  const rest = producers
    .filter(name => normSlug(name) !== 'demo')
    .map(name => ({
      loc: `${SITE_URL}/p/${slugFromProducerName(name)}`,
      name
    }));
  return [...demo, ...rest];
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
