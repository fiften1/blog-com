/* =====================================================================
   /api/likes — лайки постов.
     GET  ?ids=id1,id2        → { counts: {id: число}, liked: {id: true} }
     POST {id, like: true|false} → поставить / убрать лайк
   Один посетитель = один лайк на пост. Посетитель определяется анонимным
   отпечатком (хеш IP + браузер с секретной «солью»), сам IP не хранится.
   В базе: likes:<id> — множество отпечатков, число лайков = его размер.
   ===================================================================== */
const crypto = require('crypto');
const lib = require('./_lib');

const ID_RE = /^[a-z0-9_-]{6,64}$/;

// Анонимный отпечаток посетителя
function visitor(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);
  return crypto.createHash('sha256').update(`like:${lib.BOT() || 'salt'}:${ip}:${ua}`).digest('hex').slice(0, 20);
}

// Защита от накрутки кликами: не больше 40 действий за 10 минут с одного посетителя
const hits = new Map();
function tooMany(key) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 10 * 60e3);
  list.push(now);
  hits.set(key, list);
  return list.length > 40;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!lib.hasDb()) return res.status(200).json({ ok: true, enabled: false, counts: {}, liked: {} });
  const me = visitor(req);

  try {
    if (req.method === 'GET') {
      const ids = String((req.query && req.query.ids) || '').split(',').filter((id) => ID_RE.test(id)).slice(0, 50);
      if (!ids.length) return res.status(200).json({ ok: true, enabled: true, counts: {}, liked: {} });
      const out = await lib.pipeline(ids.flatMap((id) => [['SCARD', `likes:${id}`], ['SISMEMBER', `likes:${id}`, me]]));
      const counts = {}, liked = {};
      ids.forEach((id, i) => { counts[id] = Number(out[i * 2]) || 0; if (Number(out[i * 2 + 1]) === 1) liked[id] = true; });
      return res.status(200).json({ ok: true, enabled: true, counts, liked });
    }

    if (req.method === 'POST') {
      let body = req.body || {};
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const id = String(body.id || '');
      if (!ID_RE.test(id)) return res.status(400).json({ ok: false });
      const known = await lib.sitePosts();
      if (known && !known.has(id)) return res.status(404).json({ ok: false });
      if (tooMany(me)) return res.status(429).json({ ok: false, error: 'Слишком часто. Попробуйте чуть позже.' });

      const like = body.like !== false;
      const [, count] = await lib.pipeline([
        like ? ['SADD', `likes:${id}`, me] : ['SREM', `likes:${id}`, me],
        ['SCARD', `likes:${id}`]
      ]);
      return res.status(200).json({ ok: true, liked: like, count: Number(count) || 0 });
    }

    return res.status(405).json({ ok: false });
  } catch (e) {
    console.error('likes:', e.message);
    return res.status(500).json({ ok: false });
  }
};
