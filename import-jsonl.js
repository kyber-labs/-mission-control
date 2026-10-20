#!/usr/bin/env node
'use strict';
/**
 * import-jsonl.js — migrasi SATU KALI: data lokal versi lama (JSONL)
 * ke Supabase (sumber kebenaran tunggal). NOL dependensi.
 *
 * Cara pakai:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node import-jsonl.js [DATA_DIR] [--dry-run] [--force]
 *
 *   DATA_DIR  : folder `data/` milik versi lokal (default: ../mission-control/data,
 *               atau env MC_DATA_DIR). Berisi tasks.jsonl, queue.jsonl,
 *               dispatch.json, paused_agents.json.
 *   --dry-run : hanya tampilkan ringkasan, tidak menulis ke Supabase.
 *   --force   : tulis walau tabel tujuan sudah berisi data (tanpa ini,
 *               skrip berhenti bila mc_tasks/mc_queue tidak kosong).
 *
 * Catatan: menjalankan dua kali TANPA --force aman (ditolak). Dengan --force,
 * data akan GANDA — hanya pakai bila Bos tahu apa yang dilakukan.
 */
const fs = require('fs');
const path = require('path');
const { sb, setState } = require('./lib/db');

const ROSTER = ['Anca', 'Mu', 'Cipu', 'Jaka', 'Tono', 'Dani'];
const STATUS = ['started', 'progress', 'done', 'failed'];

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const dataDir = process.env.MC_DATA_DIR
  || args.find(a => !a.startsWith('--'))
  || path.join(__dirname, '..', 'mission-control', 'data');

function fail(msg) { console.error('GAGAL: ' + msg); process.exit(1); }

function readJsonl(file) {
  if (!fs.existsSync(file)) return { rows: [], skipped: 0 };
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const rows = [];
  let skipped = 0;
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (!t) return;
    try { rows.push(JSON.parse(t)); }
    catch (e) { fail(`baris ${i + 1} di ${path.basename(file)} bukan JSON valid: ${e.message}`); }
  });
  return { rows, skipped };
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { fail(`${path.basename(file)} bukan JSON valid: ${e.message}`); }
}

function pickTask(r, i) {
  if (!r.task_id || !r.agent || !r.status) fail(`tasks.jsonl baris ${i + 1}: wajib ada task_id, agent, status`);
  if (!ROSTER.includes(r.agent)) fail(`tasks.jsonl baris ${i + 1}: agent "${r.agent}" bukan roster`);
  if (!STATUS.includes(r.status)) fail(`tasks.jsonl baris ${i + 1}: status "${r.status}" tidak dikenal`);
  return {
    ts: r.ts || new Date().toISOString(),
    task_id: String(r.task_id),
    agent: r.agent,
    subagent: r.subagent ? String(r.subagent) : '',
    title: r.title ? String(r.title) : '',
    status: r.status,
    detail: r.detail ? String(r.detail) : '',
  };
}

function pickQueue(r, i) {
  if (!r.prompt) fail(`queue.jsonl baris ${i + 1}: wajib ada prompt`);
  if (r.agent && !ROSTER.includes(r.agent)) fail(`queue.jsonl baris ${i + 1}: agent "${r.agent}" bukan roster`);
  return {
    ts: r.ts || new Date().toISOString(),
    prompt: String(r.prompt),
    agent: r.agent || 'Anca',
    status: r.status || 'queued',
  };
}

async function bulkInsert(table, rows) {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await sb('/' + table, { method: 'POST', prefer: 'return=minimal', body: chunk });
    console.log(`  ... ${Math.min(i + CHUNK, rows.length)}/${rows.length} baris ke ${table}`);
  }
}

(async () => {
  if (!fs.existsSync(dataDir)) fail(`folder data tidak ditemukan: ${dataDir}`);
  console.log(`Sumber : ${dataDir}`);
  console.log(`Tujuan : Supabase (${(process.env.SUPABASE_URL || '').replace(/^(https?:\/\/[^/]+).*/, '$1')})`);
  if (DRY) console.log('Mode   : DRY-RUN (tidak menulis apa pun)');

  const tasks = readJsonl(path.join(dataDir, 'tasks.jsonl'));
  const queue = readJsonl(path.join(dataDir, 'queue.jsonl'));
  const dispatch = readJson(path.join(dataDir, 'dispatch.json'));
  const pausedAgents = readJson(path.join(dataDir, 'paused_agents.json'));

  const taskRows = tasks.rows.map(pickTask);
  const queueRows = queue.rows.map(pickQueue);

  console.log(`Ditemukan: ${taskRows.length} event tasks, ${queueRows.length} antrean,` +
    ` dispatch.json ${dispatch ? 'ada' : 'tidak ada'}, paused_agents.json ${pausedAgents ? 'ada' : 'tidak ada'}.`);

  // Pengaman: jangan timpa data yang sudah ada tanpa --force.
  const existingTasks = await sb('/mc_tasks?select=id&limit=1');
  const existingQueue = await sb('/mc_queue?select=id&limit=1');
  if ((existingTasks.length || existingQueue.length) && !FORCE) {
    fail(`tabel Supabase sudah berisi data (${existingTasks.length ? 'mc_tasks' : ''}${existingTasks.length && existingQueue.length ? ' + ' : ''}${existingQueue.length ? 'mc_queue' : ''}). ` +
      `Batal demi keamanan — ulangi dengan --force bila memang mau menambah (risiko data ganda).`);
  }

  if (DRY) { console.log('DRY-RUN selesai. Tidak ada yang ditulis.'); return; }

  if (taskRows.length) { console.log('Mengimpor mc_tasks...'); await bulkInsert('mc_tasks', taskRows); }
  if (queueRows.length) { console.log('Mengimpor mc_queue...'); await bulkInsert('mc_queue', queueRows); }
  if (dispatch && typeof dispatch.paused === 'boolean') {
    await setState('dispatch', { paused: dispatch.paused });
    console.log('State dispatch diimpor (paused=' + dispatch.paused + ').');
  }
  if (pausedAgents && typeof pausedAgents === 'object') {
    await setState('paused_agents', pausedAgents);
    console.log('State paused_agents diimpor.');
  }

  console.log(`SELESAI: ${taskRows.length} tasks + ${queueRows.length} queue dimigrasi ke Supabase.`);
  console.log('Langkah berikutnya: pakai dashboard Vercel sebagai satu-satunya sumber kebenaran; ' +
    'catat kerja via `node catat.js` (versi Supabase).');
})().catch(e => fail(e.message));
