/* =====================================================================
   /api/booking — принимает заявку с сайта, занимает время в базе
   и отправляет заявку в Telegram с кнопками «Подтвердить» и «Отменить».

   Переменные окружения в Vercel:
     TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — бот и ваш ID
     KV_REST_API_URL, KV_REST_API_TOKEN   — база Upstash Redis (Vercel добавляет сам)
   Без базы форма тоже работает, но не следит за занятым временем.
   ===================================================================== */
const lib = require('./_lib');
const mail = require('./_mail');

// Простейшая защита от флуда: не больше 5 заявок за 10 минут с одного IP
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

function validate(body) {
  const data = {
    service: clean(body.service, 60),
    date: clean(body.date, 10),
    time: clean(body.time, 5),
    name: clean(body.name, 80),
    phone: clean(body.phone, 30),
    email: clean(body.email, 120),
    comment: String(body.comment == null ? '' : body.comment).trim().slice(0, 1000),
    // откуда пришёл посетитель: utm_source или сайт-источник (для статистики)
    ref: clean(body.ref, 60).toLowerCase().replace(/^www\./, '')
  };
  if (!data.service) return { error: 'Выберите услугу.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return { error: 'Выберите дату.' };
  const day = Date.parse(data.date + 'T00:00:00Z');
  const now = Date.now();
  // запас в сутки на разницу часовых поясов; не дальше чем на ~62 дня
  if (isNaN(day) || day < now - 36 * 3600e3 || day > now + 62 * 24 * 3600e3) return { error: 'Эта дата недоступна.' };
  if (!/^\d{1,2}:\d{2}$/.test(data.time)) return { error: 'Выберите время.' };
  if (data.name.length < 2) return { error: 'Напишите имя.' };
  if (data.phone.replace(/\D/g, '').length < 7) return { error: 'Проверьте номер телефона.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) return { error: 'Проверьте почту.' };
  return { data };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Метод не поддерживается.' });
  }

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  // Ловушка для ботов: скрытое поле заполнено или форма «заполнена» быстрее 3 секунд.
  if (body.website || (Number(body.elapsed) > 0 && Number(body.elapsed) < 3000)) {
    return res.status(200).json({ ok: true });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) {
    return res.status(429).json({ ok: false, error: 'Слишком много заявок подряд. Попробуйте через несколько минут.' });
  }

  const { data, error } = validate(body);
  if (error) return res.status(400).json({ ok: false, error });

  if (!lib.BOT() || !lib.OWNER()) {
    console.error('booking: TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы');
    return res.status(500).json({ ok: false, error: 'Запись временно не работает.' });
  }

  // 1. Занимаем время в базе (если база подключена)
  let booking = { ...data, status: 'new' };
  if (lib.hasDb()) {
    try {
      const reserved = await lib.reserve(data);
      if (!reserved) {
        return res.status(409).json({ ok: false, taken: true, error: 'Это время уже заняли. Выберите другое.' });
      }
      booking = reserved;
    } catch (e) {
      console.error('booking: ошибка базы', e.message);
      return res.status(500).json({ ok: false, error: 'Не получилось отправить заявку.' });
    }
  }

  // 2. Отправляем в Telegram; если не вышло — освобождаем время обратно
  try {
    await lib.tg('sendMessage', {
      chat_id: lib.OWNER(),
      text: lib.bookingText(booking),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: lib.bookingKeyboard(booking)
    });
  } catch (e) {
    console.error('booking:', e.message);
    if (booking.id) await lib.cancel(booking.id).catch(() => {});
    return res.status(502).json({ ok: false, error: 'Не получилось отправить заявку.' });
  }

  // 3. Письмо клиенту «Заявка получена» со ссылкой «изменить или отменить»
  if (booking.id) await mail.sendToClient('received', booking);

  return res.status(200).json({ ok: true, manageUrl: booking.id ? lib.manageUrl(booking) : null });
};

module.exports.validate = validate;
