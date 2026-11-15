/* =====================================================================
   Общий код для серверных функций (файлы с «_» в начале Vercel
   не превращает в отдельные адреса).

   База данных — Upstash Redis (подключается в Vercel → Storage).
   Vercel сам добавляет переменные KV_REST_API_URL и KV_REST_API_TOKEN
   (или UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).

   Как хранятся записи:
     day:<дата>      — хеш «время → id записи» (занятые слоты дня)
     bk:<id>         — JSON с данными записи
     bookings        — сортированный список всех записей по времени (для /list)
   ===================================================================== */
const crypto = require('crypto');

/* ---------- Redis через REST API (без библиотек) ---------- */
const DB_URL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasDb = () => !!(DB_URL() && DB_TOKEN());

async function redis(...command) {
  const r = await fetch(DB_URL(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${DB_TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.error) throw new Error(`Redis: ${out.error || r.status}`);
  return out.result;
}

// Несколько команд одним запросом
async function pipeline(commands) {
  const r = await fetch(`${DB_URL()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DB_TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands)
  });
  const out = await r.json().catch(() => []);
  if (!r.ok || !Array.isArray(out)) throw new Error(`Redis pipeline: ${r.status}`);
  const err = out.find((x) => x && x.error);
  if (err) throw new Error(`Redis: ${err.error}`);
  return out.map((x) => x.result);
}

const KEEP_SEC = 75 * 24 * 3600; // записи хранятся ~2,5 месяца, потом удаляются сами
const WHOLE_DAY = '*';             // «время» записи, которая закрывает весь день
const slotTs = (date, time) => Date.parse(`${date}T${time === WHOLE_DAY ? '00:00' : time.padStart(5, '0')}:00Z`);

/* ---------- Записи ---------- */
// Занять слот. Возвращает запись или null, если время уже занято (или весь день закрыт).
// HSETNX атомарный: даже если двое нажмут «Отправить» одновременно, слот получит только один.
async function reserve(data) {
  const id = crypto.randomBytes(5).toString('hex');
  if (data.time !== WHOLE_DAY && (await redis('HEXISTS', `day:${data.date}`, WHOLE_DAY)) === 1) return null;
  const ok = await redis('HSETNX', `day:${data.date}`, data.time, id);
  if (ok !== 1) return null;
  const booking = { id, ...data, status: 'new', createdAt: new Date().toISOString() };
  await pipeline([
    ['SET', `bk:${id}`, JSON.stringify(booking), 'EX', KEEP_SEC],
    ['EXPIRE', `day:${data.date}`, KEEP_SEC],
    ['ZADD', 'bookings', slotTs(data.date, data.time), id]
  ]);
  return booking;
}

async function getBooking(id) {
  const raw = await redis('GET', `bk:${id}`);
  return raw ? JSON.parse(raw) : null;
}

async function saveBooking(b) {
  await redis('SET', `bk:${b.id}`, JSON.stringify(b), 'EX', KEEP_SEC);
}

// Отменить запись: освобождает слот и удаляет данные
async function cancel(id) {
  const b = await getBooking(id);
  if (!b) return null;
  const owner = await redis('HGET', `day:${b.date}`, b.time);
  const cmds = [['DEL', `bk:${id}`], ['ZREM', 'bookings', id]];
  if (owner === id) cmds.push(['HDEL', `day:${b.date}`, b.time]);
  await pipeline(cmds);
  return b;
}

// Занятые слоты дня
async function takenSlots(date) {
  const h = await redis('HGETALL', `day:${date}`);
  // Upstash отдаёт HGETALL как плоский массив [поле, значение, ...]
  const times = [];
  if (Array.isArray(h)) for (let i = 0; i < h.length; i += 2) times.push(h[i]);
  else if (h && typeof h === 'object') times.push(...Object.keys(h));
  return times;
}

// Ближайшие записи (с вчерашнего дня и дальше)
async function upcoming(limit = 15) {
  const ids = await redis('ZRANGEBYSCORE', 'bookings', Date.now() - 24 * 3600e3, '+inf', 'LIMIT', 0, limit);
  if (!ids || !ids.length) return [];
  const raws = await pipeline(ids.map((id) => ['GET', `bk:${id}`]));
  const list = [];
  const stale = [];
  raws.forEach((raw, i) => (raw ? list.push(JSON.parse(raw)) : stale.push(ids[i])));
  if (stale.length) await redis('ZREM', 'bookings', ...stale); // подчищаем истёкшие
  return list;
}

/* ---------- Telegram ---------- */
const BOT = () => process.env.TELEGRAM_BOT_TOKEN;
const OWNER = () => String(process.env.TELEGRAM_CHAT_ID || '');

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${BOT()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) throw new Error(`Telegram ${method}: ${out.description || r.status}`);
  return out.result;
}

// Секрет вебхука выводится из токена бота — отдельную переменную заводить не нужно
const webhookSecret = () => crypto.createHash('sha256').update(`webhook:${BOT()}`).digest('hex').slice(0, 48);

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function humanDate(iso, short = false) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return short ? `${d} ${MONTHS_SHORT[m - 1]}, ${WEEKDAYS[wd]}` : `${d} ${MONTHS[m - 1]} ${y} (${WEEKDAYS[wd]})`;
}

const STATUS = {
  new: '',
  confirmed: '✅ <b>Подтверждено</b>',
  cancelled: '❌ <b>Отменено</b> — время снова свободно на сайте'
};

const timeLabel = (t) => (t === WHOLE_DAY ? 'весь день' : t);

// Текст сообщения о записи
function bookingText(b, status = b.status) {
  const manual = b.source === 'manual';
  const title = b.time === WHOLE_DAY ? 'День закрыт' : manual ? 'Записано вручную' : 'Новая заявка с сайта';
  const icon = b.time === WHOLE_DAY ? '🚫' : manual ? '✍️' : '🆕';
  const head = status === 'cancelled' ? `<s>${title}</s>` : `${icon} <b>${title}</b>`;
  return [
    head,
    '',
    b.service ? `<b>Услуга:</b> ${esc(b.service)}` : '',
    `<b>Когда:</b> ${esc(humanDate(b.date))}, ${esc(timeLabel(b.time))}`,
    '',
    b.name ? `<b>${manual ? 'Кто / заметка' : 'Имя'}:</b> ${esc(b.name)}` : '',
    b.phone ? `<b>Телефон:</b> ${esc(b.phone)}` : '',
    b.email ? `<b>Почта:</b> ${esc(b.email)}` : '',
    b.comment ? `\n<b>Комментарий:</b>\n${esc(b.comment)}` : '',
    STATUS[status] ? `\n${STATUS[status]}` : ''
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- Даты и слоты для бота ---------- */
// «Сегодня» по вашему часовому поясу (можно поменять переменной BOOKING_TZ в Vercel)
const TZ = () => process.env.BOOKING_TZ || 'Europe/Warsaw';
function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function nowMinutes() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(p.find((x) => x.type === 'hour').value) * 60 + Number(p.find((x) => x.type === 'minute').value);
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Время для записи берём из content/site.json самого сайта (его меняют в админке)
const DEFAULT_SLOTS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
async function siteSlots() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host) return DEFAULT_SLOTS;
  try {
    const r = await fetch(`https://${host}/content/site.json`, { cache: 'no-store' });
    const site = await r.json();
    const slots = Array.isArray(site.slots) ? site.slots.filter((s) => /^\d{1,2}:\d{2}$/.test(s)) : [];
    return slots.length ? slots : DEFAULT_SLOTS;
  } catch (e) {
    return DEFAULT_SLOTS;
  }
}

// «Черновик» ручной записи: ждём, пока вы напишете имя/заметку
const setPending = (chatId, data) => redis('SET', `pending:${chatId}`, JSON.stringify(data), 'EX', 900);
const getPending = async (chatId) => { const raw = await redis('GET', `pending:${chatId}`); return raw ? JSON.parse(raw) : null; };
const clearPending = (chatId) => redis('DEL', `pending:${chatId}`);

// Кнопки под сообщением
function bookingKeyboard(b, status = b.status) {
  if (!b.id || status === 'cancelled') return { inline_keyboard: [] };
  const row = [];
  if (status !== 'confirmed' && b.source !== 'manual') row.push({ text: '✅ Подтвердить', callback_data: `ok:${b.id}` });
  row.push({ text: '❌ Отменить запись', callback_data: `cancel:${b.id}` });
  return { inline_keyboard: [row] };
}

module.exports = {
  hasDb, redis, pipeline, reserve, getBooking, saveBooking, cancel, takenSlots, upcoming,
  tg, BOT, OWNER, webhookSecret, esc, humanDate, timeLabel, bookingText, bookingKeyboard,
  WHOLE_DAY, todayISO, nowMinutes, addDays, siteSlots, setPending, getPending, clearPending
};
