/* =====================================================================
   /api/slots?date=ГГГГ-ММ-ДД — какое время на эту дату уже занято
   и закрыт ли день (с публичной подписью: «Выходной», «Отпуск», «Занято»).
   Отдаёт только время и подпись, без чьих-либо данных.
   ===================================================================== */
const lib = require('./_lib');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const date = String((req.query && req.query.date) || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, taken: [] });
  if (!lib.hasDb()) return res.status(200).json({ ok: true, taken: [], closed: null, db: false });
  try {
    const info = await lib.dayInfo(date);
    return res.status(200).json({ ok: true, taken: info.taken.filter((t) => t !== lib.WHOLE_DAY), closed: info.closed });
  } catch (e) {
    console.error('slots:', e.message);
    return res.status(200).json({ ok: false, taken: [], closed: null });
  }
};
