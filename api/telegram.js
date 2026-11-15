/* =====================================================================
   /api/telegram — вебхук бота. Сюда Telegram присылает нажатия кнопок
   и команды. Отвечает только вам (TELEGRAM_CHAT_ID), остальных игнорирует.

   Кнопки под заявкой:
     ✅ Подтвердить     — помечает запись подтверждённой
     ❌ Отменить запись — удаляет запись из базы, время снова свободно на сайте
   Команды:
     /list — ближайшие записи с кнопками отмены

   Первичная настройка (один раз, после подключения базы):
     откройте https://<сайт>/api/telegram?setup=1
   ===================================================================== */
const lib = require('./_lib');

const isOwner = (id) => String(id) === lib.OWNER();

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
  await lib.tg('setMyCommands', { commands: [{ command: 'list', description: 'Ближайшие записи' }] });
  return res.status(200).json({ ok: true, webhook: url, db: lib.hasDb() });
}

// Нажатие на кнопку под заявкой
async function onButton(q) {
  const [action, id] = String(q.data || '').split(':');
  const chatId = q.message && q.message.chat.id;
  const messageId = q.message && q.message.message_id;
  const answer = (text) => lib.tg('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});

  if (!isOwner(q.from.id)) return answer('Нет доступа');
  if (!lib.hasDb()) return answer('База не подключена');

  if (action === 'cancel' || action === 'del') {
    const b = await lib.cancel(id);
    if (!b) {
      await answer('Запись уже отменена или устарела');
      if (action === 'cancel') await lib.tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      return;
    }
    await answer(`Отменено: ${lib.humanDate(b.date, true)}, ${b.time}`);
    if (action === 'cancel') {
      // Кнопка под самой заявкой — переписываем её текст
      await lib.tg('editMessageText', {
        chat_id: chatId, message_id: messageId, parse_mode: 'HTML', disable_web_page_preview: true,
        text: lib.bookingText(b, 'cancelled'), reply_markup: { inline_keyboard: [] }
      }).catch(() => {});
    } else {
      // Кнопка из /list — обновляем список
      await sendList(chatId, messageId);
    }
    return;
  }

  if (action === 'ok') {
    const b = await lib.getBooking(id);
    if (!b) return answer('Запись не найдена');
    b.status = 'confirmed';
    await lib.saveBooking(b);
    await answer('Подтверждено');
    await lib.tg('editMessageText', {
      chat_id: chatId, message_id: messageId, parse_mode: 'HTML', disable_web_page_preview: true,
      text: lib.bookingText(b), reply_markup: lib.bookingKeyboard(b)
    }).catch(() => {});
    return;
  }

  return answer();
}

// Список ближайших записей; editId — обновить уже отправленный список
async function sendList(chatId, editId) {
  const list = await lib.upcoming(15);
  const text = list.length
    ? '<b>Ближайшие записи</b>\n\n' + list.map((b) =>
      `${b.status === 'confirmed' ? '✅' : '🕓'} <b>${lib.esc(lib.humanDate(b.date, true))}, ${lib.esc(b.time)}</b> — ${lib.esc(b.service)}\n${lib.esc(b.name)} · ${lib.esc(b.phone)}`).join('\n\n') +
      '\n\nНажмите кнопку, чтобы отменить запись и освободить время.'
    : 'Ближайших записей нет.';
  const reply_markup = {
    inline_keyboard: list.map((b) => [{ text: `❌ ${lib.humanDate(b.date, true)}, ${b.time} · ${b.name}`.slice(0, 60), callback_data: `del:${b.id}` }])
  };
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', reply_markup };
  if (editId) return lib.tg('editMessageText', { ...payload, message_id: editId }).catch(() => {});
  return lib.tg('sendMessage', payload);
}

async function onMessage(m) {
  if (!isOwner(m.from && m.from.id)) return; // чужим не отвечаем
  const text = String(m.text || '').trim();
  if (/^\/list/.test(text)) {
    if (!lib.hasDb()) return lib.tg('sendMessage', { chat_id: m.chat.id, text: 'База не подключена — список записей недоступен.' });
    return sendList(m.chat.id);
  }
  return lib.tg('sendMessage', {
    chat_id: m.chat.id,
    text: 'Сюда приходят заявки с сайта.\n\n/list — ближайшие записи\nПод каждой заявкой есть кнопки «Подтвердить» и «Отменить запись».'
  });
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
