/* =====================================================================
   /api/manage — клиент сам переносит или отменяет запись по ссылке из письма
   (страница /booking/?id=…&t=…). Ссылка подписана: без верного t — отказ.
     GET  ?id&t                         — данные записи
     POST {id, t, action: 'cancel'}     — отменить
     POST {id, t, action: 'move', date, time} — перенести
   О каждом действии вам приходит сообщение в Telegram.
   ===================================================================== */
const lib = require('./_lib');
const mail = require('./_mail');

const isPast = (b) => {
  const today = lib.todayISO();
  if (b.date < today) return true;
  if (b.date > today) return false;
  const [h, m] = b.time.split(':').map(Number);
  return h * 60 + m < lib.nowMinutes();
};
const view = (b) => ({ date: b.date, time: b.time, service: b.service || '', name: b.name || '', status: b.status || 'new', past: isPast(b) });

async function tellOwner(title, b, status) {
  await lib.tg('sendMessage', {
    chat_id: lib.OWNER(), parse_mode: 'HTML', disable_web_page_preview: true,
    text: `${title}\n\n${lib.bookingText(b, status)}`,
    reply_markup: status === 'cancelled' ? undefined : lib.bookingKeyboard(b)
  }).catch((e) => console.error('manage: telegram', e.message));
}

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
    if (!b || b.time === lib.WHOLE_DAY) return res.status(404).json({ ok: false, gone: true, error: 'Запись не найдена — возможно, она уже отменена или перенесена.' });

    if (req.method === 'GET') return res.status(200).json({ ok: true, booking: view(b) });
    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    if (isPast(b)) return res.status(400).json({ ok: false, error: 'Эта запись уже прошла.' });

    if (body.action === 'cancel') {
      await lib.cancel(id, 'client');
      await tellOwner('❌ <b>Клиент сам отменил запись</b>', b, 'cancelled');
      await mail.sendToClient('cancelledByClient', b);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'move') {
      const date = String(body.date || '');
      const time = String(body.time || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return res.status(400).json({ ok: false, error: 'Выберите дату и время.' });
      if (date === b.date && time === b.time) return res.status(400).json({ ok: false, error: 'Это и так ваше текущее время.' });
      if (isPast({ date, time })) return res.status(400).json({ ok: false, error: 'Это время уже прошло.' });
      if (date > lib.addDays(lib.todayISO(), 62)) return res.status(400).json({ ok: false, error: 'Эта дата недоступна.' });
      if (!(await lib.siteSlots()).includes(time)) return res.status(400).json({ ok: false, error: 'Это время недоступно.' });

      // Сначала занимаем новое время, потом освобождаем старое — так время не потеряется
      const { id: _old, status: _s, createdAt: _c, reminded: _r, ...rest } = b;
      const nb = await lib.reserve({ ...rest, date, time, status: 'new', movedFrom: `${b.date} ${b.time}` }, { count: false });
      if (!nb) return res.status(409).json({ ok: false, taken: true, error: 'Это время уже заняли. Выберите другое.' });
      await lib.cancel(id);
      await lib.track(['move']).catch(() => {});
      await tellOwner(`🔁 <b>Клиент перенёс запись</b>\nБыло: ${lib.esc(lib.humanDate(b.date, true))}, ${lib.esc(b.time)}`, nb);
      await mail.sendToClient('moved', nb);
      return res.status(200).json({ ok: true, booking: view(nb), manageUrl: lib.manageUrl(nb) });
    }

    return res.status(400).json({ ok: false, error: 'Неизвестное действие.' });
  } catch (e) {
    console.error('manage:', e.message);
    return res.status(500).json({ ok: false, error: 'Что-то пошло не так. Попробуйте ещё раз.' });
  }
};
