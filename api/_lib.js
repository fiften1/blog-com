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
/* ---------- Язык клиента (cookie `lang` с сайта: ru | pl) ----------
   Запоминается в записи (b.lang): на нём уходят письма и сообщения в Telegram. */
function reqLang(req) {
  const m = String((req && req.headers && req.headers.cookie) || '').match(/(?:^|;\s*)lang=(pl|ru)\b/);
  return m ? m[1] : '';
}
function withLang(b, req) {
  const l = reqLang(req);
  if (b && l) b.lang = l;
  return b;
}

/* ---------- Выходные: суббота и воскресенье закрыты всегда ----------
   Открыть конкретный выходной можно только в приложении (ключ wopen:<дата>). */
const WEEKEND = [6, 0];
const isWeekend = (date) => WEEKEND.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
const WOPEN_SEC = 120 * 24 * 3600;
async function weekendClosed(date) {
  return isWeekend(date) && (await redis('EXISTS', `wopen:${date}`)) !== 1;
}
async function openWeekend(date) { await redis('SET', `wopen:${date}`, '1', 'EX', WOPEN_SEC); }
async function closeWeekend(date) { await redis('DEL', `wopen:${date}`); }
// Какие выходные из списка дат открыты
async function openedWeekends(dates) {
  const wk = dates.filter(isWeekend);
  if (!wk.length) return new Set();
  const res = await pipeline(wk.map((d) => ['EXISTS', `wopen:${d}`]));
  return new Set(wk.filter((d, i) => res[i] === 1));
}

async function reserve(data, { count = true } = {}) {
  const id = crypto.randomBytes(5).toString('hex');
  if (data.time !== WHOLE_DAY && (await redis('HEXISTS', `day:${data.date}`, WHOLE_DAY)) === 1) return null;
  // Записи с сайта/из кабинета на закрытый выходной не принимаем (вы вручную — можете)
  if (data.time !== WHOLE_DAY && data.source !== 'manual' && (await weekendClosed(data.date))) return null;
  const ok = await redis('HSETNX', `day:${data.date}`, data.time, id);
  if (ok !== 1) return null;
  const booking = { id, ...data, status: data.status || 'new', createdAt: new Date().toISOString() };
  await pipeline([
    ['SET', `bk:${id}`, JSON.stringify(booking), 'EX', KEEP_SEC],
    ['EXPIRE', `day:${data.date}`, KEEP_SEC],
    ['ZADD', 'bookings', slotTs(data.date, data.time), id]
  ]);
  // Статистика: считаем новые записи (закрытые дни и переносы не считаем)
  if (count && data.time !== WHOLE_DAY) {
    await track(['total', data.source === 'manual' ? 'manual' : 'site',
      data.service ? `svc:${data.service}` : 'svc:—',
      data.source === 'manual' ? '' : `ref:${data.ref || 'прямой заход'}`]).catch(() => {});
  }
  return booking;
}

/* ---------- Статистика: счётчики по месяцам ---------- */
// stats:ГГГГ-ММ — хеш «поле → число». Месяц — когда пришла заявка.
async function track(fields, when) {
  const key = `stats:${(when || todayISO()).slice(0, 7)}`;
  const cmds = fields.filter(Boolean).map((f) => ['HINCRBY', key, f.slice(0, 80), 1]);
  if (!cmds.length) return;
  cmds.push(['EXPIRE', key, 400 * 24 * 3600]);
  await pipeline(cmds);
}
async function getStats(month) {
  const h = await redis('HGETALL', `stats:${month}`);
  const out = {};
  if (Array.isArray(h)) for (let i = 0; i < h.length; i += 2) out[h[i]] = Number(h[i + 1]);
  else if (h && typeof h === 'object') for (const [k, v] of Object.entries(h)) out[k] = Number(v);
  return out;
}

/* ---------- Ссылка для клиента «изменить или отменить» ---------- */
const siteHost = () => process.env.VERCEL_PROJECT_PRODUCTION_URL || '';
// Токен — подпись id записи ключом, выведенным из токена бота: подделать ссылку нельзя
const manageToken = (id) => crypto.createHmac('sha256', `manage:${BOT()}`).update(String(id)).digest('hex').slice(0, 24);
const manageUrl = (b) => `https://${siteHost()}/booking/?id=${encodeURIComponent(b.id)}&t=${manageToken(b.id)}`;
function checkManage(id, t) {
  if (!/^[a-f0-9]{6,20}$/.test(String(id)) || typeof t !== 'string' || t.length !== 24) return false;
  return crypto.timingSafeEqual(Buffer.from(manageToken(id)), Buffer.from(t));
}

async function getBooking(id) {
  const raw = await redis('GET', `bk:${id}`);
  return raw ? JSON.parse(raw) : null;
}

async function saveBooking(b) {
  await redis('SET', `bk:${b.id}`, JSON.stringify(b), 'EX', KEEP_SEC);
}

// Отменить запись: освобождает слот и удаляет данные.
// by: 'owner' | 'client' — для статистики отмен (без by — не считаем, например при откате или переносе)
// via — откуда отменили (для журнала отмен в приложении)
async function cancel(id, by, via) {
  const b = await getBooking(id);
  if (!b) return null;
  const owner = await redis('HGET', `day:${b.date}`, b.time);
  const cmds = [['DEL', `bk:${id}`], ['ZREM', 'bookings', id]];
  if (owner === id) cmds.push(['HDEL', `day:${b.date}`, b.time]);
  // Отменили вы — запоминаем запись на 30 дней, чтобы клиент увидел извинение
  // и мог одним нажатием выбрать другое время (без повторного заполнения анкеты)
  if (by === 'owner' && b.time !== WHOLE_DAY) {
    const cx = JSON.stringify({ ...b, cancelledAt: new Date().toISOString() });
    cmds.push(['SET', `cx:${id}`, cx, 'EX', CX_SEC]);
    if (b.email) cmds.push(['SADD', `ucx:${String(b.email).toLowerCase()}`, id], ['EXPIRE', `ucx:${String(b.email).toLowerCase()}`, CX_SEC]);
  }
  // Журнал отмен (60 дней) — вкладка «Заявки → Отменённые» в приложении
  if (by && b.time !== WHOLE_DAY) {
    const now = Date.now();
    const entry = {
      id, date: b.date, time: b.time, name: b.name || '', phone: b.phone || '', email: b.email || '',
      service: b.service || '', source: b.source || 'site', status: b.status || 'new', comment: b.comment || '',
      by, via: via || '', cancelledAt: new Date(now).toISOString()
    };
    cmds.push(['SET', `cl:${id}`, JSON.stringify(entry), 'EX', CL_SEC], ['ZADD', 'cancels', now, id],
      ['ZREMRANGEBYSCORE', 'cancels', '-inf', now - CL_SEC * 1000]);
    // и у самого клиента — чтобы в кабинете было видно, что запись отменена и кем
    const em = String(b.email || '').toLowerCase();
    if (em) cmds.push(['SADD', `ucl:${em}`, id], ['EXPIRE', `ucl:${em}`, CL_SEC]);
  }
  await pipeline(cmds);
  if (by && b.time !== WHOLE_DAY) await track([`cancel:${by}`]).catch(() => {});
  return b;
}

/* ---------- Журнал отмен: последние, новые сверху ---------- */
const CL_SEC = 60 * 24 * 3600;
async function cancelLog(limit = 60) {
  const ids = await redis('ZRANGEBYSCORE', 'cancels', Date.now() - CL_SEC * 1000, '+inf');
  if (!ids || !ids.length) return [];
  const last = ids.slice(-limit).reverse();
  const raws = await pipeline(last.map((id) => ['GET', `cl:${id}`]));
  return raws.filter(Boolean).map((r) => JSON.parse(r));
}

/* ---------- Отменённые вами записи (для «выбрать другое время») ---------- */
const CX_SEC = 30 * 24 * 3600;
async function getCancelled(id) {
  const raw = await redis('GET', `cx:${id}`);
  return raw ? JSON.parse(raw) : null;
}
async function forgetCancelled(b) {
  const cmds = [['DEL', `cx:${b.id}`]];
  if (b.email) cmds.push(['SREM', `ucx:${String(b.email).toLowerCase()}`, b.id]);
  await pipeline(cmds);
  if (b.email) await hideCancelled(b.email, b.id);
}

/* ---------- Отмены глазами клиента (кабинет) ---------- */
// Все отмены этого клиента за 60 дней: { id, date, time, service, by, cancelledAt, hidden }
async function cancelLogFor(email) {
  const e = String(email).toLowerCase();
  const [ids, hidden] = await pipeline([['SMEMBERS', `ucl:${e}`], ['SMEMBERS', `uclh:${e}`]]);
  if (!ids || !ids.length) return [];
  const raws = await pipeline(ids.map((id) => ['GET', `cl:${id}`]));
  const hide = new Set(hidden || []);
  return raws.filter(Boolean).map((r) => JSON.parse(r)).map((c) => ({ ...c, hidden: hide.has(c.id) }));
}
// «Скрыть» карточку отмены в разделе «Записи» (в истории она остаётся)
async function hideCancelled(email, id) {
  const e = String(email).toLowerCase();
  await pipeline([['SADD', `uclh:${e}`, id], ['EXPIRE', `uclh:${e}`, CL_SEC]]);
}
async function cancelledFor(email) {
  const ids = await redis('SMEMBERS', `ucx:${String(email).toLowerCase()}`);
  if (!ids || !ids.length) return [];
  const raws = await pipeline(ids.map((id) => ['GET', `cx:${id}`]));
  return raws.filter(Boolean).map((r) => JSON.parse(r));
}

/* ---------- Посты сайта (id → заголовок), кэш на минуту ---------- */
let postsCache = { at: 0, map: null };
async function sitePosts() {
  if (postsCache.map && Date.now() - postsCache.at < 60e3) return postsCache.map;
  const host = siteHost();
  if (!host) return null;
  try {
    const data = await (await fetch(`https://${host}/content/posts.json`, { cache: 'no-store' })).json();
    postsCache = { at: Date.now(), map: new Map((data.posts || []).filter((p) => p.id).map((p) => [p.id, p.title || ''])) };
  } catch (e) {
    return postsCache.map; // при ошибке — старый список (или null = не проверяем)
  }
  return postsCache.map;
}

/* ---------- Профиль клиента: имя и телефон из последней заявки (для автозаполнения) ---------- */
async function saveProfile(email, { name, phone }) {
  if (!email) return;
  await redis('SET', `profile:${String(email).toLowerCase()}`, JSON.stringify({ name: name || '', phone: phone || '' }), 'EX', 400 * 24 * 3600);
}
async function getProfile(email) {
  const raw = await redis('GET', `profile:${String(email).toLowerCase()}`);
  return raw ? JSON.parse(raw) : null;
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

// Типы закрытого дня: что увидят посетители сайта (подпись публичная, заметка — нет)
const CLOSE_TYPES = {
  dayoff: { label: 'Выходной', icon: '🌴' },
  vacation: { label: 'Отпуск', icon: '✈️' },
  busy: { label: 'Занято', icon: '🔒' }
};
const closeType = (b) => CLOSE_TYPES[b && b.closeType] || CLOSE_TYPES.busy;

// Всё о дне для сайта: занятые слоты и (если день закрыт) публичная подпись
async function dayInfo(date) {
  const times = await takenSlots(date);
  if (!times.includes(WHOLE_DAY)) {
    return { taken: times, closed: (await weekendClosed(date)) ? CLOSE_TYPES.dayoff.label : null };
  }
  const id = await redis('HGET', `day:${date}`, WHOLE_DAY);
  const b = id ? await getBooking(id) : null;
  return { taken: times, closed: closeType(b).label };
}

// Все записи в промежутке дат (для календаря в Mini App)
async function rangeBookings(from, to) {
  const ids = await redis('ZRANGEBYSCORE', 'bookings', slotTs(from, '00:00'), slotTs(to, '23:59'));
  if (!ids || !ids.length) return [];
  const raws = await pipeline(ids.map((id) => ['GET', `bk:${id}`]));
  return raws.filter(Boolean).map((raw) => JSON.parse(raw));
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

// Адрес Mini App
const appUrl = () => {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}/tg/` : null;
};

// Проверка, что запрос из Mini App пришёл от вас: подпись initData от Telegram
// (алгоритм из документации Telegram: HMAC-SHA256 с ключом от токена бота)
// token — какой бот открыл приложение (по умолчанию бот заявок; для «Комментариев» — бот модерации)
function verifyInitData(initData, maxAgeSec = 24 * 3600, token = BOT()) {
  if (!initData || typeof initData !== 'string' || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const age = Date.now() / 1000 - Number(params.get('auth_date') || 0);
  if (!(age < maxAgeSec)) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && String(user.id) === OWNER() ? user : null;
  } catch (e) {
    return null;
  }
}

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
  const day = b.time === WHOLE_DAY ? closeType(b) : null;
  const title = day ? `${day.label} — день закрыт` : manual ? 'Записано вручную' : 'Новая заявка с сайта';
  const icon = day ? day.icon : manual ? '✍️' : '🆕';
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
    b.ref ? `<i>Откуда: ${esc(b.ref)}</i>` : '',
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
const DEFAULT_SERVICES = ['Создание сайта', 'Монтаж видео', 'Дизайн', 'Консультация', 'Другое'];
async function siteConfig() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  let site = {};
  if (host) {
    try { site = await (await fetch(`https://${host}/content/site.json`, { cache: 'no-store' })).json(); } catch (e) { site = {}; }
  }
  const slots = Array.isArray(site.slots) ? site.slots.filter((s) => /^\d{1,2}:\d{2}$/.test(s)) : [];
  const services = Array.isArray(site.services) ? site.services.filter(Boolean) : [];
  return { slots: slots.length ? slots : DEFAULT_SLOTS, services: services.length ? services : DEFAULT_SERVICES };
}
const siteSlots = async () => (await siteConfig()).slots;
const siteServices = async () => (await siteConfig()).services;

// «Черновик» ручной записи: ждём, пока вы напишете имя/заметку
const setPending = (chatId, data) => redis('SET', `pending:${chatId}`, JSON.stringify(data), 'EX', 900);
const getPending = async (chatId) => { const raw = await redis('GET', `pending:${chatId}`); return raw ? JSON.parse(raw) : null; };
const clearPending = (chatId) => redis('DEL', `pending:${chatId}`);

// Кнопки под сообщением
function bookingKeyboard(b, status = b.status) {
  if (!b.id || status === 'cancelled') return { inline_keyboard: [] };
  const row = [];
  if (status !== 'confirmed' && b.source !== 'manual') row.push({ text: '✅ Подтвердить', callback_data: `ok:${b.id}` });
  row.push({ text: b.time === WHOLE_DAY ? '↩️ Открыть день' : '❌ Отменить запись', callback_data: `cancel:${b.id}` });
  const rows = [row];
  const url = appUrl();
  if (url) rows.push([{ text: '📅 Открыть календарь', web_app: { url: `${url}#${b.date}` } }]);
  return { inline_keyboard: rows };
}

/* ---------- Подтверждение заявки — ровно один раз ----------
   Возвращает { b, already }: already = true, если заявку уже подтвердили
   (в чате или в приложении) — тогда клиенту повторно ничего не отправляем. */
async function confirmBooking(id) {
  const b = await getBooking(id);
  if (!b) return { b: null };
  if (b.status === 'confirmed') return { b, already: true };
  const first = await redis('SET', `cf:${id}`, '1', 'NX', 'EX', 7 * 24 * 3600); // защита от двойного нажатия
  if (!first) return { b: { ...b, status: 'confirmed' }, already: true };
  b.status = 'confirmed';
  await saveBooking(b);
  return { b, already: false };
}

// Обновить исходное сообщение о заявке в чате (кнопки и статус), где бы её ни подтвердили/отменили
async function syncOwnerMessage(b, status = b.status, skipId) {
  if (!b || !b.tgMsg || b.tgMsg === skipId) return;
  await tg('editMessageText', {
    chat_id: OWNER(), message_id: b.tgMsg, parse_mode: 'HTML', disable_web_page_preview: true,
    text: bookingText(b, status), reply_markup: status === 'cancelled' ? { inline_keyboard: [] } : bookingKeyboard(b, status)
  }).catch(() => {}); // сообщение могли удалить или текст не изменился — не страшно
}

/* ---------- «Сейчас» как число для сравнения со временем записей (по вашему поясу) ---------- */
const nowSlotTs = () => {
  const m = nowMinutes();
  return slotTs(todayISO(), `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
};

// Записи клиента за промежуток (по почте); по умолчанию — прошлые 75 дней (история)
async function bookingsOf(email, from = nowSlotTs() - 75 * 86400e3, to = nowSlotTs()) {
  const ids = await redis('ZRANGEBYSCORE', 'bookings', from, to);
  if (!ids || !ids.length) return [];
  const raws = await pipeline(ids.map((id) => ['GET', `bk:${id}`]));
  const e = String(email).toLowerCase();
  return raws.filter(Boolean).map((r) => JSON.parse(r))
    .filter((b) => b.time !== WHOLE_DAY && String(b.email || '').toLowerCase() === e);
}

/* ---------- Telegram клиента: привязка через бота заявок ---------- */
let botNameCache = null;
// Клиентский бот (уведомления клиентам) — отдельный от вашего бота заявок.
// Если TELEGRAM_CLIENT_BOT_TOKEN не задан, клиентам пишет бот заявок (как раньше).
const CLIENT_BOT = () => process.env.TELEGRAM_CLIENT_BOT_TOKEN || BOT();
const hasClientBot = () => !!process.env.TELEGRAM_CLIENT_BOT_TOKEN;
async function clientTg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${CLIENT_BOT()}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) throw new Error(`client ${method}: ${out.description || r.status}`);
  return out.result;
}
const clientWebhookSecret = () => crypto.createHash('sha256').update(`clienthook:${CLIENT_BOT()}`).digest('hex').slice(0, 48);
async function botUsername() {
  const key = `bot:username:${crypto.createHash('sha256').update(String(CLIENT_BOT())).digest('hex').slice(0, 10)}`;
  if (botNameCache && botNameCache.key === key) return botNameCache.name;
  const cached = await redis('GET', key).catch(() => null);
  const name = cached || (await clientTg('getMe', {})).username;
  if (!cached) await redis('SET', key, name, 'EX', 7 * 86400).catch(() => {});
  botNameCache = { key, name };
  return name;
}
// Одноразовый код для ссылки t.me/<бот>?start=l_<код> (живёт 15 минут)
async function telegramLinkUrl(email) {
  const code = crypto.randomBytes(8).toString('hex');
  await redis('SET', `tglink:${code}`, String(email).toLowerCase(), 'EX', 900);
  return `https://t.me/${await botUsername()}?start=l_${code}`;
}
// Бот получил /start l_<код> — связываем чат с почтой
async function linkTelegram(code, chatId, tgName) {
  const email = await redis('GET', `tglink:${code}`);
  if (!email) return null;
  const old = await redis('GET', `tguser:${email}`);
  const cmds = [['DEL', `tglink:${code}`], ['SET', `tguser:${email}`, JSON.stringify({ chatId, name: tgName || '' })], ['SET', `tgchat:${chatId}`, email]];
  if (old) { try { const o = JSON.parse(old); if (String(o.chatId) !== String(chatId)) cmds.push(['DEL', `tgchat:${o.chatId}`]); } catch (e) {} }
  await pipeline(cmds);
  return email;
}
async function telegramOf(email) {
  const raw = await redis('GET', `tguser:${String(email).toLowerCase()}`);
  return raw ? JSON.parse(raw) : null;
}
async function unlinkTelegram(email) {
  const t = await telegramOf(email);
  const cmds = [['DEL', `tguser:${String(email).toLowerCase()}`]];
  if (t) cmds.push(['DEL', `tgchat:${t.chatId}`]);
  await pipeline(cmds);
  return t;
}

/* ---------- Избранное и «мои лайки» (для вошедших) ---------- */
const favKey = (email) => `fav:${String(email).toLowerCase()}`;
const ulikeKey = (email) => `ulike:${String(email).toLowerCase()}`;

/* ---------- Отзывы: rv:<id> → JSON; reviews — сортированный список; urv:<почта> — id записей с отзывом ---------- */
async function getReview(id) { const r = await redis('GET', `rv:${id}`); return r ? JSON.parse(r) : null; }
async function saveReview(r) {
  await pipeline([['SET', `rv:${r.id}`, JSON.stringify(r)], ['ZADD', 'reviews', r.ts, r.id], ['SADD', `urv:${r.email}`, r.bookingId]]);
}
async function deleteReview(r) {
  await pipeline([['DEL', `rv:${r.id}`], ['ZREM', 'reviews', r.id], ['SREM', `urv:${r.email}`, r.bookingId]]);
}
async function listReviews({ onlyPublished = true, email = null, limit = 50 } = {}) {
  const ids = await redis('ZRANGE', 'reviews', 0, -1);
  if (!ids || !ids.length) return [];
  const raws = await pipeline(ids.map((id) => ['GET', `rv:${id}`]));
  return raws.filter(Boolean).map((r) => JSON.parse(r))
    .filter((r) => (!onlyPublished || r.status === 'published') && (!email || r.email === email))
    .sort((a, b) => b.ts - a.ts).slice(0, limit);
}

/* ---------- Бот модерации (комментарии и отзывы) ---------- */
const MOD = () => process.env.TELEGRAM_MOD_BOT_TOKEN || '';
async function modTg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${MOD()}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) throw new Error(`mod ${method}: ${out.description || r.status}`);
  return out.result;
}

module.exports = {
  hasDb, redis, pipeline, reserve, getBooking, saveBooking, cancel, takenSlots, upcoming,
  tg, BOT, OWNER, webhookSecret, esc, humanDate, timeLabel, bookingText, bookingKeyboard,
  WHOLE_DAY, todayISO, nowMinutes, addDays, siteSlots, setPending, getPending, clearPending,
  CLOSE_TYPES, closeType, dayInfo, rangeBookings, appUrl, verifyInitData, siteServices,
  track, getStats, siteHost, manageToken, manageUrl, checkManage,
  getCancelled, forgetCancelled, cancelledFor, saveProfile, getProfile, sitePosts,
  nowSlotTs, bookingsOf, botUsername, telegramLinkUrl, linkTelegram, telegramOf, unlinkTelegram,
  favKey, ulikeKey, getReview, saveReview, deleteReview, listReviews, MOD, modTg, slotTs,
  clientTg, hasClientBot, clientWebhookSecret, confirmBooking, syncOwnerMessage, cancelLog,
  isWeekend, weekendClosed, openWeekend, closeWeekend, openedWeekends, cancelLogFor, hideCancelled,
  reqLang, withLang
};
