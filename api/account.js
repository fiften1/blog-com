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
const lib = require('./_lib');
const ops = require('./_ops');

const CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID || '';
const { MAX_AGE, makeSession, readSession, setCookie, sameOrigin } = require('./_session');
const VIA = 'в личном кабинете';

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

// Комментарии этого человека по всем постам
async function myComments(email) {
  const posts = (await lib.sitePosts()) || new Map();
  const out = [];
  for (const [postId, title] of posts) {
    const h = await lib.redis('HGETALL', `cm:${postId}`);
    const vals = Array.isArray(h) ? h.filter((_, i) => i % 2) : Object.values(h || {});
    vals.map((v) => JSON.parse(v)).filter((c) => c.email === email)
      .forEach((c) => out.push({ id: c.id, postId, postTitle: title, text: c.text, ts: c.ts }));
  }
  return out.sort((a, b) => b.ts - a.ts);
}

// Полный набор для страницы кабинета: история, Telegram, избранное, лайки, комментарии, отзывы
async function fullData(email) {
  const [history, telegram, favs, likes, comments, reviews, reviewed, bot, cancels] = await Promise.all([
    lib.bookingsOf(email),
    lib.telegramOf(email),
    lib.redis('SMEMBERS', lib.favKey(email)),
    lib.redis('SMEMBERS', lib.ulikeKey(email)),
    myComments(email),
    lib.listReviews({ onlyPublished: false, email }),
    lib.redis('SMEMBERS', `urv:${email}`),
    lib.botUsername().catch(() => null),
    lib.cancelLogFor(email)
  ]);
  return {
    history: history.map((b) => ({ ...ops.clientView(b), reviewed: (reviewed || []).includes(b.id) }))
      .concat(cancels.map((c) => ops.cancelledView(c)))
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)),
    telegram: { linked: !!telegram, name: telegram ? telegram.name : '', bot },
    favorites: favs || [],
    likes: likes || [],
    comments,
    reviews: reviews.map((r) => ({ id: r.id, bookingId: r.bookingId, rating: r.rating, text: r.text, service: r.service, ts: r.ts, status: r.status }))
  };
}

// Удалить всё, что сайт знает о человеке (по почте)
async function deleteEverything(email) {
  // будущие записи — отменяем, чтобы освободить время и предупредить владельца
  for (const b of await myBookings(email)) {
    const full = await lib.getBooking(b.id);
    if (full) await ops.clientCancel(full, 'удаление данных из кабинета').catch(() => {});
  }
  const cmds = [];
  // прошлые записи с личными данными
  (await lib.bookingsOf(email)).forEach((b) => cmds.push(['DEL', `bk:${b.id}`], ['ZREM', 'bookings', b.id]));
  // отменённые вами, отзывы, комментарии
  (await lib.cancelledFor(email)).forEach((c) => cmds.push(['DEL', `cx:${c.id}`]));
  (await lib.cancelLogFor(email)).forEach((c) => cmds.push(['DEL', `cl:${c.id}`], ['ZREM', 'cancels', c.id]));
  cmds.push(['DEL', `ucl:${email}`], ['DEL', `uclh:${email}`]);
  (await lib.listReviews({ onlyPublished: false, email, limit: 1000 })).forEach((r) => cmds.push(['DEL', `rv:${r.id}`], ['ZREM', 'reviews', r.id]));
  (await myComments(email)).forEach((c) => cmds.push(['HDEL', `cm:${c.postId}`, c.id]));
  cmds.push(['DEL', `profile:${email}`], ['DEL', lib.favKey(email)], ['DEL', lib.ulikeKey(email)], ['DEL', `ucx:${email}`], ['DEL', `urv:${email}`]);
  await lib.pipeline(cmds);
  await lib.unlinkTelegram(email);
}

// Отменённые будущие записи для раздела «Записи»: кто отменил и когда.
// Отменённые вами (cx) можно перенести на другое время с теми же данными.
async function myCancelled(email) {
  const [cx, log] = await Promise.all([lib.cancelledFor(email), lib.cancelLogFor(email)]);
  const byId = new Map(log.map((c) => [c.id, c]));
  const out = cx.map((b) => ops.cancelledView({ ...b, by: 'owner', cancelledAt: (byId.get(b.id) || {}).cancelledAt || b.cancelledAt, canRebook: true }));
  const seen = new Set(out.map((b) => b.id));
  log.filter((c) => !seen.has(c.id) && !c.hidden && !ops.isPast(c))
    .forEach((c) => out.push(ops.cancelledView({ ...c, canRebook: false })));
  return out;
}

// Всё для кабинета: будущие записи (вместе с отменёнными — кто и когда отменил) и профиль
async function myData(email) {
  const [bookings, cancelled, profile] = await Promise.all([myBookings(email), myCancelled(email), lib.getProfile(email)]);
  return {
    // сверху действующие записи (ближайшие первыми), под ними отменённые (последние отмены первыми)
    bookings: bookings.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .concat(cancelled.sort((a, b) => String(b.cancelledAt).localeCompare(String(a.cancelledAt)))),
    profile: profile || null,
    favorites: (await lib.redis('SMEMBERS', lib.favKey(email))) || []
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const enabled = !!CLIENT_ID();
  const user = readSession(req);

  try {
    if (req.method === 'GET') {
      // Лёгкая проверка статусов (сайт спрашивает раз в несколько секунд, пока кабинет открыт):
      // ?ids=a,b → { statuses: { a: 'confirmed' | 'new' | null } }, null — записи больше нет
      if (req.query && req.query.ids !== undefined) {
        if (!user || !lib.hasDb()) return res.status(200).json({ ok: true, statuses: {} });
        const ids = String(req.query.ids).split(',').filter((id) => /^[a-f0-9]{6,20}$/.test(id)).slice(0, 20);
        const raws = ids.length ? await lib.pipeline(ids.flatMap((id) => [['GET', `bk:${id}`], ['EXISTS', `cx:${id}`]])) : [];
        const statuses = {};
        ids.forEach((id, i) => {
          const b = raws[i * 2] ? JSON.parse(raws[i * 2]) : null;
          if (b) statuses[id] = String(b.email || '').toLowerCase() === user.email ? (b.status || 'new') : null;
          else statuses[id] = Number(raws[i * 2 + 1]) === 1 ? 'cancelled' : null; // отменили вы — или запись исчезла
        });
        return res.status(200).json({ ok: true, statuses });
      }
      const out = { ok: true, enabled, clientId: CLIENT_ID() || null, user: null, bookings: [] };
      if (user) {
        out.user = { email: user.email, name: user.name, picture: user.picture };
        if (lib.hasDb()) Object.assign(out, await myData(user.email));
        // ?full=1 — страница кабинета: история, Telegram, избранное, активность
        if (lib.hasDb() && req.query && req.query.full) Object.assign(out, await fullData(user.email));
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
        return res.status(200).json({ ok: true, user: u, ...(lib.hasDb() ? await myData(u.email) : { bookings: [] }) });
      }
      case 'logout':
        setCookie(res, '', 0);
        return res.status(200).json({ ok: true });
      case 'rebook':
      case 'dismiss': {
        if (!user) return res.status(401).json({ ok: false, error: 'Войдите, чтобы управлять записями.' });
        const cid = String(body.id || '').slice(0, 20);
        const cx = await lib.getCancelled(cid);
        if (body.action === 'dismiss') {
          // скрыть карточку отмены (своей или вашей) — в истории она останется
          if (cx && String(cx.email || '').toLowerCase() === user.email) await lib.forgetCancelled(cx);
          else if ((await lib.cancelLogFor(user.email)).some((c) => c.id === cid)) await lib.hideCancelled(user.email, cid);
          else return res.status(404).json({ ok: false, error: 'Запись не найдена.' });
          return res.status(200).json({ ok: true, ...(await myData(user.email)) });
        }
        if (!cx || String(cx.email || '').toLowerCase() !== user.email) return res.status(404).json({ ok: false, error: 'Запись не найдена.' });
        const r = await ops.clientRebook(lib.withLang(cx, req), body.date, body.time, VIA);
        if (!r.ok) return res.status(r.code).json({ ok: false, error: r.error, taken: r.taken });
        return res.status(200).json({ ok: true, ...(await myData(user.email)) });
      }
      case 'cancel':
      case 'move': {
        if (!user) return res.status(401).json({ ok: false, error: 'Войдите, чтобы управлять записями.' });
        if (!lib.hasDb()) return res.status(503).json({ ok: false, error: 'Сервис временно недоступен.' });
        const b = await lib.getBooking(String(body.id || '').slice(0, 20));
        // Чужие записи для этого клиента «не существуют»
        if (!b || b.time === lib.WHOLE_DAY || String(b.email || '').toLowerCase() !== user.email) {
          return res.status(404).json({ ok: false, error: 'Запись не найдена — возможно, она уже отменена.' });
        }
        lib.withLang(b, req);
        const r = body.action === 'cancel' ? await ops.clientCancel(b, VIA) : await ops.clientMove(b, body.date, body.time, VIA);
        if (!r.ok) return res.status(r.code).json({ ok: false, error: r.error, taken: r.taken });
        return res.status(200).json({ ok: true, ...(await myData(user.email)) });
      }
      // ---- Дальше — только для вошедших ----
      case 'profile': case 'book': case 'fav': case 'tglink': case 'tgunlink': case 'review': case 'deleteMe': {
        if (!user) return res.status(401).json({ ok: false, error: 'Войдите через Google.' });
        if (!lib.hasDb()) return res.status(503).json({ ok: false, error: 'Сервис временно недоступен.' });
        const email = user.email;
        const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

        if (body.action === 'profile') {
          const name = clean(body.name, 80), phone = clean(body.phone, 30);
          if (name.length < 2) return res.status(400).json({ ok: false, error: 'Напишите имя.' });
          if (phone && phone.replace(/\D/g, '').length < 7) return res.status(400).json({ ok: false, error: 'Проверьте номер телефона.' });
          await lib.saveProfile(email, { name, phone });
          return res.status(200).json({ ok: true, profile: { name, phone } });
        }

        if (body.action === 'book') {
          const prof = (await lib.getProfile(email)) || {};
          const name = prof.name || user.name || '';
          if (!prof.phone) return res.status(400).json({ ok: false, needPhone: true, error: 'Добавьте телефон в профиле — он нужен для связи.' });
          const date = clean(body.date, 10), time = clean(body.time, 5);
          const err = await ops.checkSlot(date, time);
          if (err) return res.status(400).json({ ok: false, error: err });
          const service = clean(body.service, 60);
          if (!service) return res.status(400).json({ ok: false, error: 'Выберите услугу.' });
          const r = await ops.createBooking({
            service, date, time, name, phone: prof.phone, email,
            comment: String(body.comment || '').trim().slice(0, 1000), ref: 'личный кабинет', lang: lib.reqLang(req) || undefined
          });
          if (!r.ok) return res.status(r.code).json({ ok: false, error: r.error, taken: r.taken });
          return res.status(200).json({ ok: true, ...(await myData(email)) });
        }

        if (body.action === 'fav') {
          const key = clean(body.key, 200);
          if (!/^(post:[a-z0-9_-]{6,64}|file:files\/[\w.\-]+)$/.test(key)) return res.status(400).json({ ok: false });
          await lib.redis(body.on === false ? 'SREM' : 'SADD', lib.favKey(email), key);
          return res.status(200).json({ ok: true, favorites: await lib.redis('SMEMBERS', lib.favKey(email)) });
        }

        if (body.action === 'tglink') return res.status(200).json({ ok: true, url: await lib.telegramLinkUrl(email) });
        if (body.action === 'tgunlink') { await lib.unlinkTelegram(email); return res.status(200).json({ ok: true }); }

        if (body.action === 'review') {
          const rating = Math.round(Number(body.rating));
          const text = String(body.text || '').replace(/\r/g, '').trim().slice(0, 1000);
          if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ ok: false, error: 'Поставьте оценку от 1 до 5.' });
          if (text.length < 5) return res.status(400).json({ ok: false, error: 'Напишите пару слов о визите.' });
          const b = (await lib.bookingsOf(email)).find((x) => x.id === String(body.bookingId || ''));
          if (!b || !ops.isPast(b)) return res.status(404).json({ ok: false, error: 'Отзыв можно оставить только о прошедшей записи.' });
          if ((await lib.redis('SISMEMBER', `urv:${email}`, b.id)) === 1) return res.status(409).json({ ok: false, error: 'Отзыв об этой записи уже есть.' });
          const prof = (await lib.getProfile(email)) || {};
          const rv = {
            id: require('crypto').randomBytes(5).toString('hex'), bookingId: b.id, email, rating, text,
            name: prof.name || user.name || '', picture: user.picture || '', service: b.service || '',
            ts: Date.now(), status: lib.MOD() ? 'pending' : 'published'
          };
          await lib.saveReview(rv);
          if (lib.MOD()) {
            await lib.modTg('sendMessage', {
              chat_id: lib.OWNER(), parse_mode: 'HTML',
              text: `⭐️ <b>Новый отзыв</b> · ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}\n<b>${lib.esc(rv.name)}</b> · ${lib.esc(email)}${rv.service ? ` · ${lib.esc(rv.service)}` : ''}\n\n${lib.esc(text)}`,
              reply_markup: { inline_keyboard: [[{ text: '✅ Опубликовать', callback_data: `rvok:${rv.id}` }, { text: '🗑 Удалить', callback_data: `rvdel:${rv.id}` }]] }
            }).catch((e) => console.error('review notify:', e.message));
          }
          return res.status(200).json({ ok: true, status: rv.status });
        }

        if (body.action === 'deleteMe') {
          if (body.confirm !== 'УДАЛИТЬ') return res.status(400).json({ ok: false, error: 'Подтвердите удаление.' });
          await deleteEverything(email);
          setCookie(res, '', 0);
          return res.status(200).json({ ok: true });
        }
        break;
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
