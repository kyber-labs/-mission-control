'use strict';
/**
 * POST /api/agent_pause — jeda/lanjutkan PER-AGENT (klik karakter 3D).
 * Body: {agent, paused}. Disimpan di mc_state key 'paused_agents'
 * (ganti paused_agents.json versi lokal).
 */
const db = require('../lib/db');
const { ROSTER_IDS, readJsonBody } = require('../lib/shared');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method tidak diizinkan.' });
  }
  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return res.status(400).json({ ok: false, error: 'Body harus JSON valid.' }); }

  const agent = String(body.agent || '').trim();
  if (!ROSTER_IDS.includes(agent)) {
    return res.status(400).json({ ok: false, error: `Field "agent" harus salah satu: ${ROSTER_IDS.join(', ')}.` });
  }
  const paused = !!body.paused;
  try {
    const stateMap = await db.getState();
    let map = stateMap.paused_agents;
    if (typeof map !== 'object' || map === null) map = {};
    if (paused) map[agent] = true; else delete map[agent];
    await db.setState('paused_agents', map);
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Gagal menyimpan pause agent: ' + e.message });
  }
  return res.status(200).json({ ok: true, agent, paused });
};
