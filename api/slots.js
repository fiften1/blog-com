/* =====================================================================
   /api/slots?date=ГГГГ-ММ-ДД — какое время на эту дату уже занято.
   Отдаёт только список времени, без чьих-либо данных.
   ===================================================================== */
const lib = require('./_lib');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const date = String((req.query && req.query.date) || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, taken: [] });
  if (!lib.hasDb()) return res.status(200).json({ ok: true, taken: [], db: false });
  try {
    return res.status(200).json({ ok: true, taken: await lib.takenSlots(date) });
  } catch (e) {
    console.error('slots:', e.message);
    return res.status(200).json({ ok: false, taken: [] });
  }
};
