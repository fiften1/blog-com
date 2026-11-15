/* =====================================================================
   /api/telegram — вебхук бота. Сюда Telegram присылает нажатия кнопок
   и команды. Отвечает только вам (TELEGRAM_CHAT_ID), остальных игнорирует.

   Кнопки под заявкой:
     ✅ Подтвердить     — помечает запись подтверждённой
     ❌ Отменить запись — удаляет запись из базы, время снова свободно на сайте
   Команды:
     /add  — записать вручную: день → время (или весь день) → имя/заметка
     /list — ближайшие записи с кнопками отмены

   Первичная настройка (и после смены токена/домена):
     откройте https://<сайт>/api/telegram?setup=1
   ===================================================================== */
const lib = require('./_lib');
const mail = require('./_mail');

const isOwner = (id) => String(id) === lib.OWNER();
const COMMANDS = [
  { command: 'add', description: 'Записать вручную / закрыть время' },
  { command: 'list', description: 'Ближайшие записи' }
];
const HELP = '<b>Записи с сайта</b>\n\n'
  + '📅 <b>Календарь</b> — кнопка «Записи» внизу слева: месяц, расписание дня, ручная запись, выходные.\n\n'
  + '/add — быстро записать вручную или закрыть день прямо в чате\n'
  + '/list — ближайшие записи\n\n'
  + 'Под каждой заявкой есть кнопки «Подтвердить» и «Отменить запись».';
const appButton = () => (lib.appUrl() ? { inline_keyboard: [[{ text: '📅 Открыть календарь', web_app: { url: lib.appUrl() } }]] } : undefined);

async function setup(req, res) {
  // Адрес берём из системной переменной Vercel (основной домен проекта), а не из запроса
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host;
  const url = `https://${host}/api/telegram`;
  await lib.tg('setWebhook', {
    url,
    secret_token: lib.webhookSecret(),
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
  await lib.tg('setMyCommands', { commands: COMMANDS });
  // Кнопка «Записи» слева от поля ввода открывает Mini App
  await lib.tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Записи', web_app: { url: `https://${host}/tg/` } } });
  return res.status(200).json({ ok: true, webhook: url, app: `https://${host}/tg/`, db: lib.hasDb() });
}

/* ---------- Ручная запись: экраны ---------- */
const DAYS_PER_PAGE = 14;

// Экран 1: выбор дня (по 14 дней, можно листать)
async function screenDays(chatId, messageId, page = 0) {
  const start = lib.addDays(lib.todayISO(), page * DAYS_PER_PAGE);
  const days = Array.from({ length: DAYS_PER_PAGE }, (_, i) => lib.addDays(start, i));
  const rows = [];
  for (let i = 0; i < days.length; i += 2) {
    rows.push(days.slice(i, i + 2).map((d) => ({ text: lib.humanDate(d, true), callback_data: `ad:${d}` })));
  }
  const nav = [];
  if (page > 0) nav.push({ text: '← Раньше', callback_data: `ap:${page - 1}` });
  if (page < 3) nav.push({ text: 'Позже →', callback_data: `ap:${page + 1}` });
  rows.push(nav);
  rows.push([{ text: 'Отмена', callback_data: 'ax' }]);
  return show(chatId, messageId, '✍️ <b>Записать вручную</b>\n\nВыберите день:', rows);
}

// Экран 2: выбор времени на день (занятое помечено)
async function screenTimes(chatId, messageId, date) {
  const [slots, taken] = await Promise.all([lib.siteSlots(), lib.takenSlots(date)]);
  const dayClosed = taken.includes(lib.WHOLE_DAY);
  const isToday = date === lib.todayISO();
  const now = lib.nowMinutes();
  const buttons = slots.map((t) => {
    const [h, m] = t.split(':').map(Number);
    const busy = dayClosed || taken.includes(t);
    const past = isToday && h * 60 + m < now;
    if (busy) return { text: `🔒 ${t}`, callback_data: `ab:${date}:${t}` };
    if (past) return { text: `· ${t}`, callback_data: `ab:${date}:${t}` };
    return { text: t, callback_data: `at:${date}:${t}` };
  });
  const rows = [];
  for (let i = 0; i < buttons.length; i += 4) rows.push(buttons.slice(i, i + 4));
  if (!dayClosed) rows.push([{ text: '🚫 Закрыть весь день', callback_data: `at:${date}:*` }]);
  rows.push([{ text: '← К дням', callback_data: 'ap:0' }, { text: 'Отмена', callback_data: 'ax' }]);
  const note = dayClosed
    ? '\n\n🚫 Этот день уже закрыт. Открыть его можно через /list.'
    : '\n\n🔒 — занято, · — уже прошло.';
  return show(chatId, messageId, `✍️ <b>${lib.esc(lib.humanDate(date))}</b>\n\nВыберите время:${note}`, rows);
}

// Экран 2б: какой это день — от этого зависит подпись на сайте
async function screenCloseType(chatId, messageId, date) {
  const rows = Object.entries(lib.CLOSE_TYPES).map(([k, t]) => [{ text: `${t.icon} ${t.label}`, callback_data: `ac:${date}:${k}` }]);
  rows.push([{ text: '← Назад', callback_data: `ad:${date}` }, { text: 'Отмена', callback_data: 'ax' }]);
  return show(chatId, messageId, `🚫 <b>Закрыть ${lib.esc(lib.humanDate(date))}</b>\n\nЧто увидят посетители сайта?`, rows);
}

// Экран 3: ждём имя/заметку текстом
async function screenAskName(chatId, messageId, date, time, closeType) {
  await lib.setPending(chatId, { date, time, messageId, closeType });
  const what = time === lib.WHOLE_DAY ? `${lib.CLOSE_TYPES[closeType].icon} ${lib.CLOSE_TYPES[closeType].label}` : time;
  return show(chatId, messageId,
    `✍️ <b>${lib.esc(lib.humanDate(date))}, ${lib.esc(what)}</b>\n\n`
    + (time === lib.WHOLE_DAY
      ? 'Можно написать заметку для себя одним сообщением (на сайте её не видно), или нажмите кнопку ниже.'
      : 'Напишите одним сообщением, кто записался: имя, телефон, услуга — как удобно. Или нажмите кнопку ниже.'),
    [[{ text: time === lib.WHOLE_DAY ? 'Без заметки' : 'Без имени', callback_data: 'an' }], [{ text: 'Отмена', callback_data: 'ax' }]]);
}

// Сохранение ручной записи
async function saveManual(chatId, note) {
  const p = await lib.getPending(chatId);
  if (!p) return false;
  await lib.clearPending(chatId);
  const b = await lib.reserve({
    date: p.date, time: p.time, source: 'manual', closeType: p.closeType,
    service: '', name: String(note || '').trim().slice(0, 300), phone: '', email: '', comment: ''
  });
  if (!b) {
    await show(chatId, p.messageId, '⚠️ Это время уже занято (возможно, только что записались с сайта). Выберите другое: /add', []);
    return true;
  }
  await lib.tg('editMessageText', {
    chat_id: chatId, message_id: p.messageId, parse_mode: 'HTML',
    text: lib.bookingText(b) + `\n\n${b.time === lib.WHOLE_DAY ? 'На сайте этот день теперь недоступен.' : 'На сайте это время теперь недоступно.'}`,
    reply_markup: lib.bookingKeyboard(b)
  }).catch(() => lib.tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: lib.bookingText(b), reply_markup: lib.bookingKeyboard(b) }));
  return true;
}

// Показать экран: отредактировать сообщение или отправить новое
function show(chatId, messageId, text, rows) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: rows } };
  if (messageId) return lib.tg('editMessageText', { ...payload, message_id: messageId }).catch(() => {});
  return lib.tg('sendMessage', payload);
}

/* ---------- Нажатия на кнопки ---------- */
async function onButton(q) {
  const data = String(q.data || '');
  const sep = data.indexOf(':');
  const action = sep === -1 ? data : data.slice(0, sep);
  const arg = sep === -1 ? '' : data.slice(sep + 1);
  const chatId = q.message && q.message.chat.id;
  const messageId = q.message && q.message.message_id;
  const answer = (text) => lib.tg('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});

  if (!isOwner(q.from.id)) return answer('Нет доступа');
  if (!lib.hasDb()) return answer('База не подключена');

  switch (action) {
    // --- ручная запись ---
    case 'ap': await answer(); return screenDays(chatId, messageId, Number(arg) || 0);
    case 'ad': await answer(); return screenTimes(chatId, messageId, arg);
    case 'at': {
      const [date, ...rest] = arg.split(':');
      const time = rest.join(':');
      await answer();
      if (time === lib.WHOLE_DAY) return screenCloseType(chatId, messageId, date);
      return screenAskName(chatId, messageId, date, time);
    }
    case 'ac': {
      const [date, type] = arg.split(':');
      await answer();
      return screenAskName(chatId, messageId, date, lib.WHOLE_DAY, lib.CLOSE_TYPES[type] ? type : 'dayoff');
    }
    case 'ab': return answer('Это время недоступно');
    case 'an': {
      await answer();
      if (!(await saveManual(chatId, ''))) await show(chatId, messageId, 'Черновик устарел. Начните заново: /add', []);
      return;
    }
    case 'ax':
      await lib.clearPending(chatId);
      await answer('Отменено');
      return show(chatId, messageId, 'Ручная запись отменена.', []);

    // --- отмена записи ---
    case 'cancel':
    case 'del': {
      const b = await lib.cancel(arg, 'owner');
      if (b && b.time !== lib.WHOLE_DAY) await mail.sendToClient('cancelledByOwner', b);
      if (!b) {
        await answer('Запись уже отменена или устарела');
        if (action === 'cancel') await lib.tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
        return;
      }
      await answer(`Отменено: ${lib.humanDate(b.date, true)}, ${lib.timeLabel(b.time)}`);
      if (action === 'cancel') {
        return lib.tg('editMessageText', {
          chat_id: chatId, message_id: messageId, parse_mode: 'HTML', disable_web_page_preview: true,
          text: lib.bookingText(b, 'cancelled'), reply_markup: { inline_keyboard: [] }
        }).catch(() => {});
      }
      return sendList(chatId, messageId);
    }

    // --- подтверждение ---
    case 'ok': {
      const b = await lib.getBooking(arg);
      if (!b) return answer('Запись не найдена');
      b.status = 'confirmed';
      await lib.saveBooking(b);
      const mailed = await mail.sendToClient('confirmed', b);
      await answer(mailed ? 'Подтверждено, клиенту ушло письмо' : 'Подтверждено');
      return lib.tg('editMessageText', {
        chat_id: chatId, message_id: messageId, parse_mode: 'HTML', disable_web_page_preview: true,
        text: lib.bookingText(b), reply_markup: lib.bookingKeyboard(b)
      }).catch(() => {});
    }
    default:
      return answer();
  }
}

/* ---------- Список ближайших записей ---------- */
async function sendList(chatId, editId) {
  const list = await lib.upcoming(15);
  const icon = (b) => (b.time === lib.WHOLE_DAY ? lib.closeType(b).icon : b.source === 'manual' ? '✍️' : b.status === 'confirmed' ? '✅' : '🕓');
  const who = (b) => (b.time === lib.WHOLE_DAY
    ? [lib.closeType(b).label, b.name].filter(Boolean).map(lib.esc).join(' · ')
    : [b.service, b.name, b.phone].filter(Boolean).map(lib.esc).join(' · ') || 'без имени');
  const text = list.length
    ? '<b>Ближайшие записи</b>\n\n' + list.map((b) =>
      `${icon(b)} <b>${lib.esc(lib.humanDate(b.date, true))}, ${lib.esc(lib.timeLabel(b.time))}</b>\n${who(b)}`).join('\n\n') +
      '\n\n🕓 заявка · ✅ подтверждена · ✍️ вручную · 🌴✈️🔒 день закрыт\nНажмите кнопку, чтобы отменить запись и освободить время.'
    : 'Ближайших записей нет. Добавить вручную: /add';
  const url = lib.appUrl();
  const reply_markup = {
    inline_keyboard: list.map((b) => [{
      text: `❌ ${lib.humanDate(b.date, true)}, ${lib.timeLabel(b.time)}${b.name ? ' · ' + b.name : ''}`.slice(0, 60),
      callback_data: `del:${b.id}`
    }]).concat(url ? [[{ text: '📅 Открыть календарь', web_app: { url } }]] : [])
  };
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', reply_markup };
  if (editId) return lib.tg('editMessageText', { ...payload, message_id: editId }).catch(() => {});
  return lib.tg('sendMessage', payload);
}

/* ---------- Текстовые сообщения ---------- */
async function onMessage(m) {
  if (!isOwner(m.from && m.from.id)) return; // чужим не отвечаем
  const chatId = m.chat.id;
  const text = String(m.text || '').trim();
  const needDb = () => lib.tg('sendMessage', { chat_id: chatId, text: 'База не подключена — эта функция недоступна.' });

  if (/^\/add\b/.test(text)) {
    if (!lib.hasDb()) return needDb();
    await lib.clearPending(chatId);
    return screenDays(chatId, null, 0);
  }
  if (/^\/list\b/.test(text)) {
    if (!lib.hasDb()) return needDb();
    return sendList(chatId);
  }
  // Обычный текст: если ждём имя для ручной записи — сохраняем
  if (text && !text.startsWith('/') && lib.hasDb() && (await saveManual(chatId, text))) return;
  return lib.tg('sendMessage', { chat_id: chatId, text: HELP, parse_mode: 'HTML', reply_markup: appButton() });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!lib.BOT() || !lib.OWNER()) return res.status(500).json({ ok: false, error: 'Бот не настроен' });

  try {
    if (req.method === 'GET') {
      if (req.query && req.query.setup) return await setup(req, res);
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'POST') return res.status(405).end();

    // Принимаем только запросы от Telegram (секрет задаётся при setWebhook)
    if (req.headers['x-telegram-bot-api-secret-token'] !== lib.webhookSecret()) return res.status(401).end();

    let update = req.body || {};
    if (typeof update === 'string') { try { update = JSON.parse(update); } catch (e) { update = {}; } }
    if (update.callback_query) await onButton(update.callback_query);
    else if (update.message) await onMessage(update.message);
  } catch (e) {
    console.error('telegram:', e.message);
  }
  // Telegram всегда получает 200, иначе будет повторять запрос
  return res.status(200).json({ ok: true });
};
