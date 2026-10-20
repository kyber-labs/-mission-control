'use strict';
/**
 * Mission Control (versi Vercel) — klien Supabase REST (PostgREST),
 * NOL dependensi (pakai global fetch Node 18+).
 *
 * Kredensial HANYA dari env var (tidak pernah di-hardcode):
 *   SUPABASE_URL              mis. https://xyzcompany.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service_role key (melewati RLS)
 */
function cfg() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('ENV belum diset: SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi (Vercel → Project Settings → Environment Variables).');
  }
  return { base: url.replace(/\/+$/, '') + '/rest/v1', key };
}

async function sb(path, opts) {
  opts = opts || {};
  const method = opts.method || 'GET';
  const { base, key } = cfg();
  const headers = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
  };
  if (method === 'GET') headers['Prefer'] = 'return=representation';
  else if (opts.prefer) headers['Prefer'] = opts.prefer;
  else headers['Prefer'] = 'return=representation';

  const r = await fetch(base + path, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await r.text().catch(() => '');
  if (!r.ok) {
    throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  }
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return text; }
}

/** Ambil seluruh mc_state sebagai map {key: value}. */
async function getState() {
  const rows = await sb('/mc_state?select=key,value');
  const map = {};
  for (const r of rows || []) map[r.key] = r.value;
  return map;
}

/** Upsert satu baris mc_state (butuh PK `key` di payload). */
async function setState(key, value) {
  return sb('/mc_state', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: { key, value, updated_at: new Date().toISOString() },
  });
}

module.exports = { sb, getState, setState };
