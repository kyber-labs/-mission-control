#!/usr/bin/env node
'use strict';
/**
 * catat.js — helper pencatatan ledger Mission Control, VERSI VERCEL/SUPABASE.
 * NOL dependensi (pakai global fetch Node 18+).
 *
 * Cara pakai (argumen SAMA seperti versi lokal):
 *   node catat.js started  Dani "slug-tugas" "Judul singkat" ["detail..."]
 *   node catat.js done     Dani "slug-tugas" "Judul singkat" ["detail..."]
 *
 * Status: started | progress | done | failed
 * Agent : Anca | Mu | Cipu | Jaka | Tono | Dani
 *
 * Butuh env var (jangan tulis key di file!):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Contoh (Linux/macOS):
 *   export SUPABASE_URL="https://xyzcompany.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   node catat.js started Dani "fitur-x" "Coding fitur X"
 */
const ROSTER = ['Anca', 'Mu', 'Cipu', 'Jaka', 'Tono', 'Dani'];
const STATUS = ['started', 'progress', 'done', 'failed'];

function tsWib() {
  const offMs = 7 * 60 * 60 * 1000; // WIB = UTC+7
  const d = new Date(Date.now() + offMs);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+07:00`;
}

async function main() {
  const [status, agent, task_id, title, detail] = process.argv.slice(2);

  if (!STATUS.includes(status)) {
    console.error('status harus salah satu: ' + STATUS.join(' | '));
    process.exit(1);
  }
  if (!ROSTER.includes(agent)) {
    console.error('agent harus salah satu: ' + ROSTER.join(' | '));
    process.exit(1);
  }
  if (!task_id || !title) {
    console.error('pakai: node catat.js <status> <agent> "<task_id>" "<judul>" ["detail"]');
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ENV belum diset: SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.');
    process.exit(1);
  }

  const event = {
    ts: tsWib(),
    task_id,
    agent,
    subagent: '',
    title,
    status,
    detail: detail || '',
  };

  const r = await fetch(url.replace(/\/+$/, '') + '/rest/v1/mc_tasks', {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(event),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error(`gagal mencatat (${r.status}): ${t.slice(0, 300)}`);
    process.exit(1);
  }
  console.log('tercatat:', JSON.stringify(event));
}

main().catch((e) => { console.error('gagal:', e.message); process.exit(1); });
