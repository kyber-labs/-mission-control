'use strict';
/**
 * GET /api/state — Mission Control (versi Vercel).
 * Bentuk respons IDENTIK dengan server.js versi lokal agar frontend
 * (index.html, disalin verbatim) tidak perlu diubah.
 *
 * Perbedaan jujur vs versi lokal:
 *  - Ledger dibaca dari Supabase (mc_tasks, mc_queue, mc_state),
 *    bukan file JSONL.
 *  - Metrik mesin (/proc: CPU load, memory container, disk) TIDAK
 *    tersedia di serverless → field dikosongkan agar frontend
 *    menampilkan "—" (tidak dipalsukan).
 *  - Kartu "Tunnel" menampilkan URL publik deployment ini sendiri
 *    (nyata: request ini baru saja berhasil dijawab).
 *  - schedules: [] — file cron user ada di VM lokal, tidak ada di
 *    Vercel; frontend menampilkan empty-state yang jujur.
 */
const db = require('../lib/db');
const { ROSTER_IDS, nowWibIso, fmtWib, deriveAgents, buildLog, publicUrl } = require('../lib/shared');

function getTokenStatus() {
  return {
    connected: false,
    usage: null,
    limit: null,
    message: 'Belum tersambung — belum ada perintah status langganan di server ini.',
    hint: 'Versi Vercel: sambungkan di api/state.js fungsi getTokenStatus() bila ada API status paket.',
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method tidak diizinkan.' });
  }
  const t0 = Date.now();
  try {
    // Satu query per tabel; tasks diambil desc (terbaru dulu) lalu
    // dibalik untuk derivasi yang butuh urutan menaik.
    const [tasksDesc, queueDesc, stateMap] = await Promise.all([
      db.sb('/mc_tasks?select=ts,task_id,agent,subagent,title,status,detail,created_at&order=created_at.desc&limit=1000'),
      db.sb('/mc_queue?select=ts,prompt,agent,status&order=ts.desc&limit=100'),
      db.getState(),
    ]);
    const dbLatencyMs = Date.now() - t0;

    const tasksAsc = [...(tasksDesc || [])].reverse();
    const queueFifo = [...(queueDesc || [])].reverse().map(q => ({
      ts: q.ts, prompt: q.prompt, agent: q.agent, status: q.status || 'queued',
    }));
    const tasksHistory = (tasksDesc || []).slice(0, 200).map(e => ({
      ts: e.ts, task_id: e.task_id, agent: e.agent, subagent: e.subagent || '',
      title: e.title, status: e.status, detail: e.detail || '',
    }));

    const dispatchVal = stateMap.dispatch || {};
    const dispatchPaused = !!dispatchVal.paused;
    const pausedAgents = (stateMap.paused_agents && typeof stateMap.paused_agents === 'object')
      ? stateMap.paused_agents : {};

    const pubUrl = publicUrl(req);
    const checkedIso = nowWibIso();
    const region = process.env.VERCEL_REGION || null;

    const body = {
      ok: true,
      ts: checkedIso,
      agents: deriveAgents(tasksAsc, dispatchPaused, pausedAgents),
      queue: queueFifo,
      tasks: tasksHistory,
      system: {
        // Metrik mesin tidak tersedia di serverless — null/0 agar
        // frontend menampilkan "—", bukan angka palsu.
        load1: null, load5: null, load15: null,
        cpu_count: 0,
        db_latency_ms: dbLatencyMs,
        note: 'Metrik mesin (/proc) tidak tersedia di serverless Vercel.',
      },
      vps: {
        disk: { mount: '/' },
        cpu: {},
        memory: {
          label: 'MEMORY (SERVERLESS)',
          sub: 'metrik mesin tidak tersedia di serverless — kartu ini informatif',
        },
        uptime: {},
        tunnel: {
          url: pubUrl,
          online: !!pubUrl,
          checked_ts: checkedIso,
          checked_human: fmtWib(checkedIso),
        },
        os: { pretty: region ? `Vercel Serverless · ${region}` : 'Vercel Serverless' },
        watchdog: { last_ts: null, last_event: null, last_url: null },
      },
      schedules: [],
      token: getTokenStatus(),
      dispatch_paused: dispatchPaused,
      paused_agents: pausedAgents,
      log: buildLog(tasksAsc),
    };
    return res.status(200).json(body);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Gagal membaca database: ' + e.message });
  }
};
