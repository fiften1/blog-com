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
  return lib.tg('sendMessage', {
    chat_id: lib.OWNER(), parse_mode: 'HTML', disable_web_page_preview: true,
    text: `${title}\n\n${lib.bookingText(b, status)}`,
    reply_markup: status === 'cancelled' ? undefined : lib.bookingKeyboard(b)
  }).catch((e) => console.error('ops: telegram', e.message));
}

// Отмена клиентом. via — откуда: 'по ссылке из письма' / 'в личном кабинете'
async function clientCancel(b, via) {
  if (isPast(b)) return { error: 'Эта запись уже прошла.', code: 400 };
  await lib.cancel(b.id, 'client', via);
  await lib.syncOwnerMessage(b, 'cancelled');
  await tellOwner(`❌ <b>Клиент сам отменил запись</b> (${lib.esc(via)})`, b, 'cancelled');
  await mail.notifyClient('cancelledByClient', b);
  return { ok: true };
}

// Перенос клиентом: сначала занимаем новое время, потом освобождаем старое
async function moveUnlocked(b, date, time, via) {
  date = String(date || '');
  time = String(time || '');
  if (isPast(b)) return { error: 'Эта запись уже прошла.', code: 400 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return { error: 'Выберите дату и время.', code: 400 };
  if (date === b.date && time === b.time) return { error: 'Это и так ваше текущее время.', code: 400 };
  if (isPast({ date, time })) return { error: 'Это время уже прошло.', code: 400 };
  if (date > lib.addDays(lib.todayISO(), 62)) return { error: 'Эта дата недоступна.', code: 400 };
  if (!(await lib.siteSlots()).includes(time)) return { error: 'Это время недоступно.', code: 400 };
  if (lib.hasDb() && (await lib.weekendClosed(date))) return { error: 'В этот день записи нет — выходной.', code: 400 };

  const { id: _old, status: _s, createdAt: _c, reminded: _r, soonReminded: _sr, tgMsg: _m, ...rest } = b;
  const nb = await lib.reserve({ ...rest, date, time, status: 'new', movedFrom: `${b.date} ${b.time}` }, { count: false });
  if (!nb) return { error: 'Это время уже заняли. Выберите другое.', code: 409, taken: true };
  // старую запись могли отменить одновременно с переносом — тогда новую не оставляем
  if (!(await lib.cancel(b.id))) { await lib.cancel(nb.id); return { error: 'Запись уже отменена.', code: 409 }; }
  await lib.track(['move']).catch(() => {});
  await lib.syncOwnerMessage(b, 'cancelled'); // старая заявка в чате — без кнопок
  const msg = await tellOwner(`🔁 <b>Клиент перенёс запись</b> (${lib.esc(via)})\nБыло: ${lib.esc(lib.humanDate(b.date, true))}, ${lib.esc(b.time)}`, nb);
  if (msg && msg.message_id) { nb.tgMsg = msg.message_id; await lib.saveBooking(nb).catch(() => {}); }
  await mail.notifyClient('moved', nb);
  return { ok: true, booking: nb };
}

// Проверка нового времени (общая для переноса и повторной записи после отмены)
async function checkSlot(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return 'Выберите дату и время.';
  if (isPast({ date, time })) return 'Это время уже прошло.';
  if (date > lib.addDays(lib.todayISO(), 62)) return 'Эта дата недоступна.';
  if (!(await lib.siteSlots()).includes(time)) return 'Это время недоступно.';
  if (lib.hasDb() && (await lib.weekendClosed(date))) return 'В этот день записи нет — выходной.';
  return null;
}

// Защита от двойного нажатия «Перенести»/«Записаться на это время»: одна операция на запись за раз.
// Замок снимается сразу после операции (30 с — только на случай сбоя посередине).
async function withLock(id, busyText, fn) {
  if (lib.hasDb() && (await lib.redis('SET', `op:${id}`, '1', 'NX', 'EX', 30)) !== 'OK') return { error: busyText, code: 409 };
  try { return await fn(); }
  finally { if (lib.hasDb()) await lib.redis('DEL', `op:${id}`).catch(() => {}); }
}
const clientMove = (b, date, time, via) => withLock(b.id, 'Уже переношу — подождите пару секунд.', () => moveUnlocked(b, date, time, via));
const clientRebook = (cx, date, time, via) => withLock(cx.id, 'Уже записываю — подождите пару секунд.', () => rebookUnlocked(cx, date, time, via));

// Как видна клиенту запись, которую отменили вы
const cancelledView = (b) => ({
  id: b.id, date: b.date, time: b.time, service: b.service || '', name: b.name || '', status: 'cancelled', cancelled: true,
  cancelledBy: b.by || 'owner', cancelledAt: b.cancelledAt || '', canRebook: !!b.canRebook
});

// Повторная запись на другое время после вашей отмены — с теми же данными клиента
async function rebookUnlocked(cx, date, time, via) {
  date = String(date || '');
  time = String(time || '');
  const err = await checkSlot(date, time);
  if (err) return { error: err, code: 400 };
  // забираем отменённую запись одной командой: второй такой же запрос её уже не найдёт
  if (lib.hasDb() && !(await lib.redis('GETDEL', `cx:${cx.id}`))) return { error: 'Запись не найдена — возможно, она уже отменена или перенесена.', code: 409 };
  const { id: _old, status: _s, createdAt: _c, reminded: _r, soonReminded: _sr, tgMsg: _tg, cancelledAt: _x, movedFrom: _m, ...rest } = cx;
  const nb = await lib.reserve({ ...rest, date, time, status: 'new', rebookedFrom: `${cx.date} ${cx.time}` }, { count: false });
  if (!nb) {
    await lib.redis('SET', `cx:${cx.id}`, JSON.stringify(cx), 'EX', 30 * 24 * 3600).catch(() => {}); // вернуть возможность выбрать время
    return { error: 'Это время уже заняли. Выберите другое.', code: 409, taken: true };
  }
  await lib.forgetCancelled(cx);
  await lib.track(['rebook']).catch(() => {});
  const msg = await tellOwner(`🔁 <b>Клиент выбрал новое время после вашей отмены</b> (${lib.esc(via)})\nБыло: ${lib.esc(lib.humanDate(cx.date, true))}, ${lib.esc(cx.time)}`, nb).catch(() => null);
  if (msg && msg.message_id) { nb.tgMsg = msg.message_id; await lib.saveBooking(nb).catch(() => {}); }
  await mail.notifyClient('rebooked', nb);
  return { ok: true, booking: nb };
}

// Новая запись (из анкеты на сайте или из личного кабинета):
// занять время → сообщить вам в бот (если не вышло — освободить время) → профиль → письмо клиенту
async function createBooking(data, { title } = {}) {
  let booking = { ...data, status: 'new' };
  if (lib.hasDb()) {
    try {
      const reserved = await lib.reserve(data);
      if (!reserved) return { error: 'Это время уже заняли. Выберите другое.', code: 409, taken: true };
      booking = reserved;
    } catch (e) {
      console.error('booking: ошибка базы', e.message);
      return { error: 'Не получилось отправить заявку.', code: 500 };
    }
  }
  try {
    const msg = await lib.tg('sendMessage', {
      chat_id: lib.OWNER(), parse_mode: 'HTML', disable_web_page_preview: true,
      text: (title ? `${title}\n\n` : '') + lib.bookingText(booking),
      reply_markup: lib.bookingKeyboard(booking)
    });
    // запоминаем сообщение, чтобы потом обновлять его кнопки (подтвердили в приложении и т.п.)
    if (booking.id && msg && msg.message_id && lib.hasDb()) {
      booking.tgMsg = msg.message_id;
      await lib.saveBooking(booking).catch(() => {});
    }
  } catch (e) {
    console.error('booking:', e.message);
    if (booking.id) await lib.cancel(booking.id).catch(() => {});
    return { error: 'Не получилось отправить заявку.', code: 502 };
  }
  if (lib.hasDb()) await lib.saveProfile(booking.email, booking).catch(() => {});
  if (booking.id) await mail.notifyClient('received', booking);
  return { ok: true, booking };
}

module.exports = { isPast, clientView, cancelledView, clientCancel, clientMove, clientRebook, checkSlot, createBooking };
