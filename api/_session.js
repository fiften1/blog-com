/* =====================================================================
   Сессия посетителя, вошедшего через Google: подписанная cookie «sid»
   (HttpOnly, Secure, SameSite=Lax, 30 дней). Общая для кабинета и комментариев.
   ===================================================================== */
const crypto = require('crypto');
const lib = require('./_lib');

const COOKIE = 'sid';
const MAX_AGE = 30 * 24 * 3600;

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

// Защита от запросов с чужих сайтов: POST только с нашего адреса
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // старые браузеры не шлют Origin; cookie SameSite=Lax всё равно не уйдёт с чужого сайта
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

module.exports = { MAX_AGE, makeSession, readSession, setCookie, sameOrigin };
