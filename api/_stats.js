import { getServiceRoleKey, getSupabaseUrl, getSupabaseAnonKey } from './_env.js';
import { serviceHeaders, producerMatchesSlug } from './_portfolio.js';

const VALID_TYPES = new Set(['view', 'save', 'buy_click']);

export async function getUserFromToken(token) {
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

export async function getProducerFromUserId(userId, token) {
  const anon = getSupabaseAnonKey();
  const url = getSupabaseUrl();
  const res = await fetch(
    `${url}/rest/v1/profiles?id=eq.${userId}&select=producer_name&limit=1`,
    { headers: { Authorization: `Bearer ${token}`, apikey: anon, Accept: 'application/json' } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.producer_name?.trim() || null;
}

async function fetchProfiles() {
  const res = await fetch(
    `${getSupabaseUrl()}/rest/v1/profiles?select=producer_name&producer_name=not.is.null`,
    { headers: serviceHeaders(), cache: 'no-store' }
  );
  if (!res.ok) return [];
  return res.json();
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

export async function resolveProducerName(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const profiles = await fetchProfiles();
  let match = profiles.find(p => p.producer_name === raw);
  if (match) return match.producer_name;

  match = profiles.find(p => producerMatchesSlug(p.producer_name, raw));
  if (match) return match.producer_name;

  const producers = await fetchApprovedProducers();
  const fromSlug = producers.find(p => producerMatchesSlug(p, raw));
  if (fromSlug) return fromSlug;

  return producers.includes(raw) ? raw : null;
}

export function isValidEventType(type) {
  return VALID_TYPES.has(type);
}

export async function insertPortfolioEvent(producer, eventType, beatId) {
  if (!getServiceRoleKey()) throw new Error('Server not configured');

  const row = {
    producer,
    event_type: eventType,
    beat_id: beatId ? String(beatId) : null
  };

  const res = await fetch(`${getSupabaseUrl()}/rest/v1/portfolio_events`, {
    method: 'POST',
    headers: {
      ...serviceHeaders('return=minimal'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(row)
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'Could not track event');
    throw new Error(err || 'Could not track event');
  }
}

async function countEvents(producer, eventType) {
  const res = await fetch(
    `${getSupabaseUrl()}/rest/v1/portfolio_events?producer=eq.${encodeURIComponent(producer)}&event_type=eq.${eventType}&select=id`,
    {
      headers: {
        ...serviceHeaders(),
        Prefer: 'count=exact',
        Range: '0-0'
      },
      cache: 'no-store'
    }
  );
  if (!res.ok) return 0;
  const range = res.headers.get('content-range') || '';
  const m = range.match(/\/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

export async function fetchProducerStats(producer) {
  const [views, saves, buys] = await Promise.all([
    countEvents(producer, 'view'),
    countEvents(producer, 'save'),
    countEvents(producer, 'buy_click')
  ]);
  return { views, saves, buys, period: 'all' };
}
