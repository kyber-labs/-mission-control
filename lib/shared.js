'use strict';
/**
 * Mission Control (versi Vercel) — logika bersama, NOL dependensi.
 * Replikasi logika derivasi dari server.js versi lokal agar bentuk
 * respons /api/state IDENTIK dengan yang diharapkan frontend.
 */

const ROSTER = [
  { id: 'Anca', name: 'Anca', role: 'Project Manager / General' },
  { id: 'Mu',   name: 'Mu',   role: 'Graphic Designer' },
  { id: 'Cipu', name: 'Cipu', role: 'Video Editor' },
  { id: 'Jaka', name: 'Jaka', role: 'QC Visual' },
  { id: 'Tono', name: 'Tono', role: 'Riset' },
  { id: 'Dani', name: 'Dani', role: 'Coding' },
];
const ROSTER_IDS = ROSTER.map(a => a.id);

/* ---------- Waktu (WIB, replika server.js) ---------- */
const ID_MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
function pad2(n) { return String(n).padStart(2, '0'); }
function nowWibIso(d) {
  d = d || new Date();
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  return wib.toISOString().slice(0, 19) + '+07:00';
}
function tzParts(tz, date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    y: +parts.year, mo: +parts.month, d: +parts.day,
    h: parts.hour === '24' ? 0 : +parts.hour, mi: +parts.minute, s: +parts.second,
  };
}
function fmtWib(isoOrDate) {
  const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
  if (isNaN(d.getTime())) return '-';
  const p = tzParts('Asia/Jakarta', d);
  return `${p.d} ${ID_MONTHS[p.mo - 1]} ${p.y}, ${pad2(p.h)}:${pad2(p.mi)}`;
}
function humanDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  const parts = [];
  if (d) parts.push(d + ' hari');
  if (h) parts.push(h + ' jam');
  if (m || !parts.length) parts.push(m + ' mnt');
  return parts.join(' ');
}

/* ---------- Derivasi status agent (replika server.js) ----------
 * tasksAsc: array event terurut created_at MENAIK (setara urutan append
 * di tasks.jsonl). Event started/progress terakhir per task_id tanpa
 * done/failed sesudahnya = working. paused (per-agent/global) > working.
 */
function deriveAgents(tasksAsc, dispatchPaused, pausedAgents) {
  const latestByTask = {};
  for (const e of tasksAsc) {
    if (!e || !e.task_id || !ROSTER_IDS.includes(e.agent)) continue;
    latestByTask[e.task_id] = e; // iterasi menaik: yang terakhir menang
  }
  const activeByAgent = {};
  for (const tid of Object.keys(latestByTask)) {
    const e = latestByTask[tid];
    if (e.status === 'started' || e.status === 'progress') {
      const cur = activeByAgent[e.agent];
      if (!cur || String(e.ts) > String(cur.ts)) activeByAgent[e.agent] = e;
    }
  }
  return ROSTER.map(a => {
    const perAgentPaused = !!(pausedAgents && pausedAgents[a.id]);
    const task = activeByAgent[a.id] || null;
    let status = 'idle';
    if (perAgentPaused || dispatchPaused) status = 'paused';
    else if (task) status = 'working';
    return {
      id: a.id, name: a.name, role: a.role,
      status, paused: perAgentPaused,
      task: task ? {
        task_id: task.task_id, title: task.title || task.task_id,
        status: task.status, ts: task.ts, detail: task.detail || '',
        subagent: task.subagent || '',
      } : null,
    };
  });
}

/* ---------- Log aktivitas (format sama dengan versi lokal) ---------- */
function buildLog(tasksAsc) {
  const entries = [];
  for (const e of tasksAsc) {
    if (!e || !e.ts) continue;
    const who = ROSTER_IDS.includes(e.agent) ? e.agent : '??';
    entries.push({ ts: String(e.ts), line: `${fmtWib(e.ts)} · [${who}] ${e.title || e.task_id || '?'} — ${e.status || '?'}` });
  }
  entries.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return entries.slice(0, 60).map(e => e.line);
}

/* ---------- Body JSON untuk Vercel functions ----------
 * Vercel biasanya sudah mem-parse req.body untuk application/json,
 * tapi tetap tangani string / stream mentah agar robust.
 */
async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      const s = req.body.trim();
      return s ? JSON.parse(s) : {};
    }
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8').trim();
  return s ? JSON.parse(s) : {};
}

function publicUrl(req) {
  const host = req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  if (!host) return null;
  const h = String(host).split(',')[0].trim();
  return /^https?:\/\//i.test(h) ? h : 'https://' + h;
}

module.exports = {
  ROSTER, ROSTER_IDS,
  nowWibIso, fmtWib, humanDuration,
  deriveAgents, buildLog, readJsonBody, publicUrl,
};
