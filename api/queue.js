'use strict';
/**
 * POST /api/queue — tambah item ke antrean (Supabase mc_queue).
 * Body: {prompt, agent}. Validasi & pesan error sama dengan versi lokal.
 */
const db = require('../lib/db');
const { ROSTER_IDS, nowWibIso, readJsonBody } = require('../lib/shared');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method tidak diizinkan.' });
  }
  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return res.status(400).json({ ok: false, error: 'Body harus JSON valid.' }); }

  const prompt = String(body.prompt || '').trim();
  const agent = String(body.agent || '').trim();
  if (!prompt) return res.status(400).json({ ok: false, error: 'Field "prompt" wajib diisi.' });
  if (!ROSTER_IDS.includes(agent)) {
    return res.status(400).json({ ok: false, error: `Field "agent" harus salah satu: ${ROSTER_IDS.join(', ')}.` });
  }

  const item = { ts: nowWibIso(), prompt: prompt.slice(0, 2000), agent, status: 'queued' };
  try {
    await db.sb('/mc_queue', { method: 'POST', body: item });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Gagal menulis antrean: ' + e.message });
  }
  return res.status(200).json({ ok: true, item });
};
