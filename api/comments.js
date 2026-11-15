/* =====================================================================
   /api/comments — комментарии к постам (писать могут только вошедшие через Google)
   и вебхук отдельного Telegram-бота модерации.

   Сайт:
     GET  ?post=<id>              → { enabled, comments: [...], user }
     GET  ?counts=<id1,id2>       → { counts: {id: число} }
     POST {action:'add', post, text}    — новый комментарий (нужен вход)
     POST {action:'delete', post, id}   — удалить свой комментарий
   Бот модерации (отдельный от бота заявок):
     POST от Telegram (секретный заголовок) — кнопка «🗑 Удалить»
     GET  ?setup=1                — подключить вебхук бота модерации

   Переменные окружения в Vercel:
     TELEGRAM_MOD_BOT_TOKEN — токен второго бота от @BotFather
     (кому слать — тот же TELEGRAM_CHAT_ID, ваш ID)
   В базе: cm:<postId> — хеш «id комментария → JSON».
   ===================================================================== */
const crypto = require('crypto');
const lib = require('./_lib');
const { readSession, sameOrigin } = require('./_session');

const MOD = () => process.env.TELEGRAM_MOD_BOT_TOKEN || '';
const enabled = () => !!(lib.hasDb() && MOD() && process.env.GOOGLE_CLIENT_ID);
const POST_RE = /^[a-z0-9_-]{6,64}$/;
const MAX_LEN = 1000;
const MAX_PER_POST = 500;

// Запрос к боту модерации
async function mod(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${MOD()}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) throw new Error(`mod ${method}: ${out.description || r.status}`);
  return out.result;
}
const modSecret = () => crypto.createHash('sha256').update(`modhook:${MOD()}`).digest('hex').slice(0, 48);

// Что видят посетители (почта автора не показывается)
const view = (c, me) => ({ id: c.id, name: c.name, picture: c.picture, text: c.text, ts: c.ts, mine: !!me && c.email === me.email });

async function list(postId) {
  const h = await lib.redis('HGETALL', `cm:${postId}`);
  const out = [];
  if (Array.isArray(h)) for (let i = 0; i < h.length; i += 2) out.push(JSON.parse(h[i + 1]));
  else if (h && typeof h === 'object') for (const v of Object.values(h)) out.push(JSON.parse(v));
  return out.sort((a, b) => a.ts - b.ts);
}

// Не больше 5 комментариев за 10 минут от одного человека
const hits = new Map();
function tooMany(key) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 10 * 60e3);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > 5;
}

const postUrl = (postId) => `https://${lib.siteHost()}/#post-${postId}`;

// Уведомление в бот модерации
async function notifyNew(c, title) {
  try {
    const msg = await mod('sendMessage', {
      chat_id: lib.OWNER(), parse_mode: 'HTML', disable_web_page_preview: true,
      text: `💬 <b>Новый комментарий</b> к «${lib.esc(title || 'посту')}»\n<b>${lib.esc(c.name)}</b> · ${lib.esc(c.email)}\n\n${lib.esc(c.text)}`,
      reply_markup: { inline_keyboard: [[
        { text: '🗑 Удалить', callback_data: `cdel:${c.postId}:${c.id}` },
        { text: '↗️ Открыть пост', url: postUrl(c.postId) }
      ]] }
    });
    return msg && msg.message_id;
  } catch (e) {
    console.error('comments:', e.message);
    return null;
  }
}
// Пометить сообщение в боте как удалённое
async function markDeleted(c, who) {
  if (!c.tgMsg) return;
  await mod('editMessageText', {
    chat_id: lib.OWNER(), message_id: c.tgMsg, parse_mode: 'HTML', disable_web_page_preview: true,
    text: `🗑 <s>Комментарий</s> удалён ${who}\n<b>${lib.esc(c.name)}</b>\n\n<s>${lib.esc(c.text)}</s>`
  }).catch(() => {});
}

async function removeComment(postId, id) {
  const raw = await lib.redis('HGET', `cm:${postId}`, id);
  if (!raw) return null;
  await lib.redis('HDEL', `cm:${postId}`, id);
  return JSON.parse(raw);
}

// ---------- Вебхук бота модерации ----------
async function onTelegram(update) {
  const q = update.callback_query;
  if (q) {
    const answer = (text) => mod('answerCallbackQuery', { callback_query_id: q.id, text }).catch(() => {});
    if (String(q.from.id) !== lib.OWNER()) return answer('Нет доступа');
    const [action, postId, id] = String(q.data || '').split(':');
    if (action !== 'cdel') return answer();
    const c = await removeComment(postId, id);
    if (!c) {
      await answer('Уже удалён');
      return mod('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    }
    await answer('Комментарий удалён');
    return markDeleted({ ...c, tgMsg: q.message.message_id }, 'вами');
  }
  const m = update.message;
  if (m && String(m.from && m.from.id) === lib.OWNER()) {
    return mod('sendMessage', { chat_id: m.chat.id, text: 'Сюда приходят новые комментарии с сайта. Под каждым есть кнопка «🗑 Удалить».' });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    // Telegram → вебхук бота модерации
    if (req.method === 'POST' && req.headers['x-telegram-bot-api-secret-token']) {
      if (!MOD() || req.headers['x-telegram-bot-api-secret-token'] !== modSecret()) return res.status(401).end();
      let update = req.body || {};
      if (typeof update === 'string') { try { update = JSON.parse(update); } catch (e) { update = {}; } }
      await onTelegram(update).catch((e) => console.error('comments tg:', e.message));
      return res.status(200).json({ ok: true });
    }

    const q = req.query || {};
    if (req.method === 'GET') {
      if (q.setup) {
        if (!MOD()) return res.status(503).json({ ok: false, error: 'TELEGRAM_MOD_BOT_TOKEN не задан' });
        const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || req.headers.host;
        await mod('setWebhook', { url: `https://${host}/api/comments`, secret_token: modSecret(), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
        return res.status(200).json({ ok: true, webhook: `https://${host}/api/comments` });
      }
      if (!enabled()) return res.status(200).json({ ok: true, enabled: false, comments: [], counts: {} });
      if (q.counts !== undefined) {
        const ids = String(q.counts).split(',').filter((id) => POST_RE.test(id)).slice(0, 50);
        const lens = ids.length ? await lib.pipeline(ids.map((id) => ['HLEN', `cm:${id}`])) : [];
        const counts = {};
        ids.forEach((id, i) => { counts[id] = Number(lens[i]) || 0; });
        return res.status(200).json({ ok: true, enabled: true, counts });
      }
      const postId = String(q.post || '');
      if (!POST_RE.test(postId)) return res.status(400).json({ ok: false });
      const me = readSession(req);
      return res.status(200).json({
        ok: true, enabled: true,
        user: me ? { name: me.name, picture: me.picture } : null,
        comments: (await list(postId)).map((c) => view(c, me))
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    if (!enabled()) return res.status(503).json({ ok: false, error: 'Комментарии пока выключены.' });
    if (!sameOrigin(req)) return res.status(403).json({ ok: false });
    const me = readSession(req);
    if (!me) return res.status(401).json({ ok: false, error: 'Войдите через Google, чтобы комментировать.' });

    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const postId = String(body.post || '');
    if (!POST_RE.test(postId)) return res.status(400).json({ ok: false });

    if (body.action === 'add') {
      const posts = await lib.sitePosts();
      if (posts && !posts.has(postId)) return res.status(404).json({ ok: false, error: 'Пост не найден.' });
      const text = String(body.text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_LEN);
      if (text.length < 2) return res.status(400).json({ ok: false, error: 'Напишите хотя бы пару слов.' });
      if (tooMany(me.email)) return res.status(429).json({ ok: false, error: 'Слишком много комментариев подряд. Попробуйте чуть позже.' });
      if ((await lib.redis('HLEN', `cm:${postId}`)) >= MAX_PER_POST) return res.status(400).json({ ok: false, error: 'Под этим постом уже слишком много комментариев.' });

      const c = {
        id: crypto.randomBytes(5).toString('hex'), postId, text, ts: Date.now(),
        name: String(me.name || me.email.split('@')[0]).slice(0, 80), picture: me.picture || '', email: me.email
      };
      await lib.redis('HSET', `cm:${postId}`, c.id, JSON.stringify(c));
      const tgMsg = await notifyNew(c, posts && posts.get(postId));
      if (tgMsg) { c.tgMsg = tgMsg; await lib.redis('HSET', `cm:${postId}`, c.id, JSON.stringify(c)); }
      return res.status(200).json({ ok: true, comment: view(c, me) });
    }

    if (body.action === 'delete') {
      const raw = await lib.redis('HGET', `cm:${postId}`, String(body.id || ''));
      const c = raw ? JSON.parse(raw) : null;
      if (!c || c.email !== me.email) return res.status(404).json({ ok: false, error: 'Комментарий не найден.' });
      await removeComment(postId, c.id);
      await markDeleted(c, 'автором');
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Неизвестное действие.' });
  } catch (e) {
    console.error('comments:', e.message);
    return res.status(500).json({ ok: false, error: 'Что-то пошло не так. Попробуйте ещё раз.' });
  }
};
