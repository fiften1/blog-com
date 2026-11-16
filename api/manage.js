/* =====================================================================
   /api/manage — клиент сам переносит или отменяет запись по ссылке из письма
   (страница /booking/?id=…&t=…). Ссылка подписана: без верного t — отказ.
     GET  ?id&t                         — данные записи
     POST {id, t, action: 'cancel'}     — отменить
     POST {id, t, action: 'move', date, time} — перенести
   О каждом действии вам приходит сообщение в Telegram.
   ===================================================================== */
const lib = require('./_lib');
const ops = require('./_ops');

const VIA = 'по ссылке из письма';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!lib.hasDb() || !lib.BOT()) return res.status(503).json({ ok: false, error: 'Сервис временно недоступен.' });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const src = req.method === 'GET' ? (req.query || {}) : body;
  const id = String(src.id || '');
  if (!lib.checkManage(id, src.t)) return res.status(403).json({ ok: false, error: 'Ссылка недействительна.' });

  try {
    const b = await lib.getBooking(id);
    if (!b || b.time === lib.WHOLE_DAY) {
      // Запись отменили вы — показываем извинение и даём выбрать другое время
      const cx = await lib.getCancelled(id);
      if (cx) {
        if (req.method === 'GET') return res.status(200).json({ ok: true, booking: ops.cancelledView(cx) });
        if (body.action !== 'rebook') return res.status(400).json({ ok: false, error: 'Эта запись уже отменена.' });
        const r = await ops.clientRebook(lib.withLang(cx, req), body.date, body.time, VIA);
        if (!r.ok) return res.status(r.code).json({ ok: false, error: r.error, taken: r.taken });
        return res.status(200).json({ ok: true, booking: ops.clientView(r.booking), manageUrl: lib.manageUrl(r.booking) });
      }
      return res.status(404).json({ ok: false, gone: true, error: 'Запись не найдена — возможно, она уже отменена или перенесена.' });
    }

    if (req.method === 'GET') return res.status(200).json({ ok: true, booking: ops.clientView(b) });
    if (req.method !== 'POST') return res.status(405).json({ ok: false });

    if (body.action === 'cancel') {
      lib.withLang(b, req);
      const r = await ops.clientCancel(b, VIA);
      return r.ok ? res.status(200).json({ ok: true }) : res.status(r.code).json({ ok: false, error: r.error });
    }
    if (body.action === 'move') {
      lib.withLang(b, req);
      const r = await ops.clientMove(b, body.date, body.time, VIA);
      if (!r.ok) return res.status(r.code).json({ ok: false, error: r.error, taken: r.taken });
      return res.status(200).json({ ok: true, booking: ops.clientView(r.booking), manageUrl: lib.manageUrl(r.booking) });
    }
    return res.status(400).json({ ok: false, error: 'Неизвестное действие.' });
  } catch (e) {
    console.error('manage:', e.message);
    return res.status(500).json({ ok: false, error: 'Что-то пошло не так. Попробуйте ещё раз.' });
  }
};
