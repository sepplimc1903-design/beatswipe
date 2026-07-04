import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let loaded = false;

function parseEnvFile(text) {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

export function ensureLocalEnv() {
  if (loaded) return;
  loaded = true;
  if (process.env.VERCEL_ENV === 'production') return;
  for (const file of ['.env.development.local', '.env.local', '.env']) {
    const path = join(process.cwd(), file);
    if (!existsSync(path)) continue;
    try {
      parseEnvFile(readFileSync(path, 'utf8'));
    } catch (_) {}
  }
}

export function getServiceRoleKey() {
  ensureLocalEnv();
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
}

export function getSupabaseUrl() {
  ensureLocalEnv();
  return process.env.SUPABASE_URL || 'https://yprwklxolgrlyswqwkzr.supabase.co';
}

export function getSupabaseAnonKey() {
  ensureLocalEnv();
  return process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY
    || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwcndrbHhvbGdybHlzd3F3a3pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDE5MjUsImV4cCI6MjA5NjIxNzkyNX0.Or_pWAg1QuJ3TSVLdC8LKzp1PsYwTxcAfy_YcSAU2ZA';
}

export function getAdminEmails() {
  ensureLocalEnv();
  const raw = process.env.BEATSWIPE_ADMIN_EMAILS || 'hellobeatswipe@gmail.com';
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email) {
  if (!email) return false;
  return getAdminEmails().includes(String(email).trim().toLowerCase());
}
