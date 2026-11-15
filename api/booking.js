/* =====================================================================
   /api/booking — принимает заявку с сайта и отправляет её в Telegram.
   Работает как серверная функция Vercel (папка api/ подхватывается сама).

   Нужны переменные окружения в Vercel → Settings → Environment Variables:
     TELEGRAM_BOT_TOKEN — токен бота от @BotFather
     TELEGRAM_CHAT_ID   — ваш ID в Telegram (куда слать заявки)
   Токены хранятся только в Vercel, в код и в репозиторий они не попадают.
   ===================================================================== */

// Простейшая защита от спама: не больше 5 заявок за 10 минут с одного IP
// (в памяти одного экземпляра функции — от массовых атак не спасает, от случайного флуда — да)
const hits = new Map();
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT;
}

// Экранирование для parse_mode=HTML в Telegram
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function humanDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d} ${MONTHS[m - 1]} ${y} (${WEEKDAYS[wd]})`;
}

function validate(body) {
  const data = {
    service: clean(body.service, 60),
    date: clean(body.date, 10),
    time: clean(body.time, 5),
    name: clean(body.name, 80),
    phone: clean(body.phone, 30),
    email: clean(body.email, 120),
    comment: String(body.comment == null ? '' : body.comment).trim().slice(0, 1000)
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
  // Отвечаем «успехом», чтобы бот не понял, что его отсеяли, но ничего не отправляем.
  if (body.website || (Number(body.elapsed) > 0 && Number(body.elapsed) < 3000)) {
    return res.status(200).json({ ok: true });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) {
    return res.status(429).json({ ok: false, error: 'Слишком много заявок подряд. Попробуйте через несколько минут.' });
  }

  const { data, error } = validate(body);
  if (error) return res.status(400).json({ ok: false, error });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('booking: TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы');
    return res.status(500).json({ ok: false, error: 'Запись временно не работает.' });
  }

  const text = [
    '🆕 <b>Новая заявка с сайта</b>',
    '',
    `<b>Услуга:</b> ${esc(data.service)}`,
    `<b>Когда:</b> ${esc(humanDate(data.date))}, ${esc(data.time)}`,
    '',
    `<b>Имя:</b> ${esc(data.name)}`,
    `<b>Телефон:</b> ${esc(data.phone)}`,
    `<b>Почта:</b> ${esc(data.email)}`,
    data.comment ? `\n<b>Комментарий:</b>\n${esc(data.comment)}` : ''
  ].join('\n').trim();

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    const out = await tg.json().catch(() => ({}));
    if (!tg.ok || !out.ok) {
      console.error('booking: Telegram ответил ошибкой', tg.status, out.description);
      return res.status(502).json({ ok: false, error: 'Не получилось отправить заявку.' });
    }
  } catch (e) {
    console.error('booking: нет связи с Telegram', e.message);
    return res.status(502).json({ ok: false, error: 'Не получилось отправить заявку.' });
  }

  return res.status(200).json({ ok: true });
};

// Для локальных тестов
module.exports.validate = validate;
module.exports.humanDate = humanDate;
