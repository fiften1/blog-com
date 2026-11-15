/* =====================================================================
   /api/cron — запускается Vercel Cron раз в день (расписание в vercel.json,
   06:00 UTC = 07:00 по Варшаве зимой / 08:00 летом).
     1. Утренняя сводка вам в Telegram: записи на сегодня и сколько на завтра
     2. Напоминания клиентам на почту о записи на завтра
   Защита: если задан CRON_SECRET — нужен заголовок от Vercel; в любом случае
   задача выполняется не больше одного раза в день (замок в базе).
   ===================================================================== */
const lib = require('./_lib');
const mail = require('./_mail');

const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
const byTime = (a, b) => a.time.localeCompare(b.time, 'en', { numeric: true });

function summaryText(today, todays, tomorrows) {
  const e = lib.esc;
  const closed = todays.find((b) => b.time === lib.WHOLE_DAY);
  const list = todays.filter((b) => b.time !== lib.WHOLE_DAY).sort(byTime);
  const lines = [`☀️ <b>Доброе утро!</b> Сегодня ${e(lib.humanDate(today))}`, ''];

  if (closed) {
    const t = lib.closeType(closed);
    lines.push(`${t.icon} <b>${e(t.label)}</b>${closed.name ? ' — ' + e(closed.name) : ''}`);
  }
  if (list.length) {
    lines.push(`<b>${list.length} ${plural(list.length, ['запись', 'записи', 'записей'])}:</b>`);
    list.forEach((b) => {
      const icon = b.source === 'manual' ? '✍️' : b.status === 'confirmed' ? '✅' : '🕓';
      const who = [b.name || 'без имени', b.service, b.phone].filter(Boolean).map(e).join(' · ');
      lines.push(`${icon} <b>${e(b.time)}</b> — ${who}`);
    });
    const unconfirmed = list.filter((b) => b.source !== 'manual' && b.status !== 'confirmed').length;
    if (unconfirmed) lines.push('', `⚠️ Не подтверждено: ${unconfirmed}`);
  } else if (!closed) {
    lines.push('Записей на сегодня нет — свободный день.');
  }

  const tClosed = tomorrows.find((b) => b.time === lib.WHOLE_DAY);
  const tCount = tomorrows.filter((b) => b.time !== lib.WHOLE_DAY).length;
  lines.push('', tClosed
    ? `Завтра: ${lib.closeType(tClosed).icon} ${e(lib.closeType(tClosed).label)}`
    : `Завтра: ${tCount ? `${tCount} ${plural(tCount, ['запись', 'записи', 'записей'])}` : 'записей пока нет'}`);
  return lines.join('\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false });
  if (!lib.hasDb() || !lib.BOT() || !lib.OWNER()) return res.status(503).json({ ok: false, error: 'not configured' });

  const today = lib.todayISO();
  const tomorrow = lib.addDays(today, 1);

  // Не больше одного запуска в день
  const lock = await lib.redis('SET', `cron:${today}`, '1', 'NX', 'EX', 2 * 24 * 3600);
  if (lock !== 'OK') return res.status(200).json({ ok: true, skipped: 'already ran today' });

  const result = { ok: true, summary: false, reminders: 0 };
  try {
    const [todays, tomorrows] = await Promise.all([lib.rangeBookings(today, today), lib.rangeBookings(tomorrow, tomorrow)]);

    // 1. Сводка
    const url = lib.appUrl();
    await lib.tg('sendMessage', {
      chat_id: lib.OWNER(), parse_mode: 'HTML', disable_web_page_preview: true,
      text: summaryText(today, todays, tomorrows),
      reply_markup: url ? { inline_keyboard: [[{ text: '📅 Открыть календарь', web_app: { url: `${url}#${today}` } }]] } : undefined
    });
    result.summary = true;

    // 2. Напоминания клиентам о завтрашних записях
    for (const b of tomorrows) {
      if (b.time === lib.WHOLE_DAY || !b.email || b.reminded) continue;
      if (await mail.sendToClient('reminder', b)) {
        b.reminded = true;
        await lib.saveBooking(b);
        result.reminders++;
      }
    }
  } catch (e) {
    console.error('cron:', e.message);
    result.ok = false;
  }
  return res.status(200).json(result);
};

module.exports.summaryText = summaryText;
