/* =====================================================================
   /api/account — личный кабинет клиента (вход через Google).
     GET                                   → { enabled, clientId, user, bookings }
     POST {action: 'login', credential}    — вход: токен от кнопки Google
     POST {action: 'logout'}               — выход
     POST {action: 'cancel', id}           — отменить свою запись
     POST {action: 'move', id, date, time} — перенести свою запись
   Записи клиента находятся по его почте Google.

   Переменная окружения в Vercel:
     GOOGLE_CLIENT_ID — «Идентификатор клиента» OAuth из Google Cloud Console
   Сессия — подписанная cookie (HttpOnly, 30 дней); пароли не хранятся.
   ===================================================================== */
const crypto = require('crypto');
const lib = require('./_lib');
const ops = require('./_ops');

const CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || '';
const COOKIE = 'sid';
const MAX_AGE = 30 * 24 * 3600;
const VIA = 'в личном кабинете';

// Секрет для подписи cookie: SESSION_SECRET или выведенный из токена бота
const secret = () => process.env.SESSION_SECRET || crypto.createHash('sha256').update(`session:${lib.BOT() || ''}`).digest('hex');
const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function makeSession(user) {
  const data = b64(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  return `${data}.${sign(data)}`;
}
function readSession(req) {
  const raw = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [data, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!data || !sig) return null;
  const good = sign(data);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try {
    const s = JSON.parse(Buffer.from(data, 'base64url').toString());
    return s.exp > Date.now() / 1000 ? s : null;
  } catch (e) {
    return null;
  }
}
const setCookie = (res, value, maxAge) => res.setHeader('Set-Cookie',
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);

// Проверка токена Google: Google сам подтверждает подпись и срок, мы — что токен выдан нашему сайту
async function verifyGoogle(credential) {
  if (!credential || typeof credential !== 'string' || credential.length > 4096) return null;
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!r.ok) return null;
  const t = await r.json();
  if (t.aud !== CLIENT_ID()) return null;
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)) return null;
  if (String(t.email_verified) !== 'true' || !t.email) return null;
  if (Number(t.exp) * 1000 < Date.now()) return null;
  return { email: String(t.email).toLowerCase(), name: String(t.name || t.given_name || '').slice(0, 80), picture: String(t.picture || '').slice(0, 300) };
}

// Будущие записи этого клиента (по почте)
async function myBookings(email) {
  const list = await lib.upcoming(500);
  return list
    .filter((b) => b.time !== lib.WHOLE_DAY && String(b.email || '').toLowerCase() === email)
    .map(ops.clientView)
    .filter((b) => !b.past);
}

// Защита от запросов с чужих сайтов: POST только с нашего адреса
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // старые браузеры не шлют Origin; cookie SameSite=Lax всё равно не уйдёт с чужого сайта
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const enabled = !!CLIENT_ID();
  const user = readSession(req);

  try {
    if (req.method === 'GET') {
      const out = { ok: true, enabled, clientId: CLIENT_ID() || null, user: null, bookings: [] };
      if (user) {
        out.user = { email: user.email, name: user.name, picture: user.picture };
        if (lib.hasDb()) out.bookings = await myBookings(user.email);
      }
      return res.status(200).json(out);
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    if (!sameOrigin(req)) return res.status(403).json({ ok: false });

    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

    switch (body.action) {
      case 'login': {
        if (!enabled) return res.status(503).json({ ok: false, error: 'Вход через Google пока не настроен.' });
        const u = await verifyGoogle(body.credential);
        if (!u) return res.status(401).json({ ok: false, error: 'Не получилось войти. Попробуйте ещё раз.' });
        setCookie(res, makeSession(u), MAX_AGE);
        return res.status(200).json({ ok: true, user: u, bookings: lib.hasDb() ? await myBookings(u.email) : [] });
      }
      case 'logout':
        setCookie(res, '', 0);
        return res.status(200).json({ ok: true });
      case 'cancel':
      case 'move': {
        if (!user) return res.status(401).json({ ok: false, error: 'Войдите, чтобы управлять записями.' });
        if (!lib.hasDb()) return res.status(503).json({ ok: false, error: 'Сервис временно недоступен.' });
        const b = await lib.getBooking(String(body.id || '').slice(0, 20));
        // Чужие записи для этого клиента «не существуют»
        if (!b || b.time === lib.WHOLE_DAY || String(b.email || '').toLowerCase() !== user.email) {
          return res.status(404).json({ ok: false, error: 'Запись не найдена — возможно, она уже отменена.' });
        }
        const r = body.action === 'cancel' ? await ops.clientCancel(b, VIA) : await ops.clientMove(b, body.date, body.time, VIA);
        if (!r.ok) return res.status(r.code).json({ ok: false, error: r.error, taken: r.taken });
        return res.status(200).json({ ok: true, bookings: await myBookings(user.email) });
      }
      default:
        return res.status(400).json({ ok: false, error: 'Неизвестное действие.' });
    }
  } catch (e) {
    console.error('account:', e.message);
    return res.status(500).json({ ok: false, error: 'Что-то пошло не так. Попробуйте ещё раз.' });
  }
};

module.exports.makeSession = makeSession;
