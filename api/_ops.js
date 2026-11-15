/* =====================================================================
   Действия клиента со своей записью — общие для ссылки из письма
   (/api/manage) и личного кабинета (/api/account).
   ===================================================================== */
const lib = require('./_lib');
const mail = require('./_mail');

// Запись уже прошла? (по вашему часовому поясу)
function isPast(b) {
  const today = lib.todayISO();
  if (b.date < today) return true;
  if (b.date > today) return false;
  const [h, m] = b.time.split(':').map(Number);
  return h * 60 + m < lib.nowMinutes();
}

// Что видит клиент о своей записи
const clientView = (b) => ({
  id: b.id, date: b.date, time: b.time, service: b.service || '', name: b.name || '',
  status: b.status || 'new', past: isPast(b)
});

async function tellOwner(title, b, status) {
  await lib.tg('sendMessage', {
    chat_id: lib.OWNER(), parse_mode: 'HTML', disable_web_page_preview: true,
    text: `${title}\n\n${lib.bookingText(b, status)}`,
    reply_markup: status === 'cancelled' ? undefined : lib.bookingKeyboard(b)
  }).catch((e) => console.error('ops: telegram', e.message));
}

// Отмена клиентом. via — откуда: 'по ссылке из письма' / 'в личном кабинете'
async function clientCancel(b, via) {
  if (isPast(b)) return { error: 'Эта запись уже прошла.', code: 400 };
  await lib.cancel(b.id, 'client');
  await tellOwner(`❌ <b>Клиент сам отменил запись</b> (${lib.esc(via)})`, b, 'cancelled');
  await mail.sendToClient('cancelledByClient', b);
  return { ok: true };
}

// Перенос клиентом: сначала занимаем новое время, потом освобождаем старое
async function clientMove(b, date, time, via) {
  date = String(date || '');
  time = String(time || '');
  if (isPast(b)) return { error: 'Эта запись уже прошла.', code: 400 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return { error: 'Выберите дату и время.', code: 400 };
  if (date === b.date && time === b.time) return { error: 'Это и так ваше текущее время.', code: 400 };
  if (isPast({ date, time })) return { error: 'Это время уже прошло.', code: 400 };
  if (date > lib.addDays(lib.todayISO(), 62)) return { error: 'Эта дата недоступна.', code: 400 };
  if (!(await lib.siteSlots()).includes(time)) return { error: 'Это время недоступно.', code: 400 };

  const { id: _old, status: _s, createdAt: _c, reminded: _r, ...rest } = b;
  const nb = await lib.reserve({ ...rest, date, time, status: 'new', movedFrom: `${b.date} ${b.time}` }, { count: false });
  if (!nb) return { error: 'Это время уже заняли. Выберите другое.', code: 409, taken: true };
  await lib.cancel(b.id);
  await lib.track(['move']).catch(() => {});
  await tellOwner(`🔁 <b>Клиент перенёс запись</b> (${lib.esc(via)})\nБыло: ${lib.esc(lib.humanDate(b.date, true))}, ${lib.esc(b.time)}`, nb);
  await mail.sendToClient('moved', nb);
  return { ok: true, booking: nb };
}

module.exports = { isPast, clientView, clientCancel, clientMove };
