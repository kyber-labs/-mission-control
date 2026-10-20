'use strict';
/**
 * POST /api/dispatch — set jeda global. Body: {paused: true|false}.
 * Disimpan di mc_state key 'dispatch' (ganti dispatch.json versi lokal).
 */
const db = require('../lib/db');
const { readJsonBody } = require('../lib/shared');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method tidak diizinkan.' });
  }
  let body;
  try { body = await readJsonBody(req); }
  catch (e) { return res.status(400).json({ ok: false, error: 'Body harus JSON valid.' }); }

  const paused = !!body.paused;
  try {
    await db.setState('dispatch', { paused });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Gagal menyimpan state dispatch: ' + e.message });
  }
  return res.status(200).json({ ok: true, paused });
};
