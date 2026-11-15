/* =====================================================================
   /api/app — данные для Mini App (страница /tg/ внутри Telegram).
   Каждый запрос подписан Telegram (initData); пускаем только владельца
   (TELEGRAM_CHAT_ID). Действия:
     month   {from, to}                       — записи за период + настройки + заявки, ждущие подтверждения
     add     {date, time, name, phone, service, comment} — записать вручную
     close   {date, type, note}               — закрыть день (dayoff | vacation | busy)
     cancel  {id}                             — отменить запись / открыть день
     confirm {id}                             — подтвердить заявку
   ===================================================================== */
const lib = require('./_lib');
const mail = require('./_mail');

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const isTime = (t) => /^\d{1,2}:\d{2}$/.test(t);

// Только нужные приложению поля
const view = (b) => ({
  id: b.id, date: b.date, time: b.time, status: b.status || 'new', source: b.source || 'site',
  service: b.service || '', name: b.name || '', phone: b.phone || '', email: b.email || '', comment: b.comment || '',
  closeType: b.time === lib.WHOLE_DAY ? (b.closeType || 'busy') : undefined
});

// Заявки с сайта, которые ещё не подтверждены (только будущие)
async function pendingList() {
  const now = lib.nowSlotTs();
  return (await lib.upcoming(500))
    .filter((b) => b.time !== lib.WHOLE_DAY && (b.source || 'site') === 'site' && b.status !== 'confirmed' && lib.slotTs(b.date, b.time) >= now)
    .sort((a, b) => lib.slotTs(a.date, a.time) - lib.slotTs(b.date, b.time))
    .map(view);
}

// Сообщение в чат о действии из приложения (чтобы история была и в переписке)
async function notify(b, verb) {
  await lib.tg('sendMessage', {
    chat_id: lib.OWNER(), parse_mode: 'HTML', disable_notification: true,
    text: `${verb}\n\n${lib.bookingText(b)}`, reply_markup: lib.bookingKeyboard(b)
  }).catch(() => {});
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  if (!lib.verifyInitData(body.initData)) return res.status(401).json({ ok: false, error: 'Откройте приложение из вашего бота в Telegram.' });
  if (!lib.hasDb()) return res.status(503).json({ ok: false, error: 'База не подключена.' });

  try {
    switch (body.action) {
      case 'month': {
        if (!isDate(body.from) || !isDate(body.to)) return res.status(400).json({ ok: false, error: 'Неверный период.' });
        const [list, cfg, pending, cancelled] = await Promise.all([lib.rangeBookings(body.from, body.to), (async () => ({ slots: await lib.siteSlots(), services: await lib.siteServices() }))(), pendingList(), lib.cancelLog()]);
        // Выходные (сб, вс) закрыты по умолчанию — показываем их как «🌴 Выходной», пока вы не откроете день
        const dates = [];
        for (let d = body.from; d <= body.to && dates.length < 62; d = lib.addDays(d, 1)) dates.push(d);
        const opened = await lib.openedWeekends(dates);
        const busy = new Set(list.map((b) => b.date));
        const weekendOff = dates.filter((d) => lib.isWeekend(d) && !opened.has(d) && !busy.has(d))
          .map((d) => ({ id: `wk:${d}`, date: d, time: lib.WHOLE_DAY, status: 'new', source: 'manual', closeType: 'dayoff', name: '', weekend: true }));
        return res.status(200).json({
          ok: true, today: lib.todayISO(), nowMinutes: lib.nowMinutes(),
          slots: cfg.slots, services: cfg.services, closeTypes: lib.CLOSE_TYPES,
          bookings: list.map(view).concat(weekendOff), pending, cancelled,
          openedWeekends: [...opened]
        });
      }

      case 'add': {
        const data = {
          date: clean(body.date, 10), time: clean(body.time, 5), source: 'manual',
          name: clean(body.name, 120), phone: clean(body.phone, 30), service: clean(body.service, 60),
          email: '', comment: String(body.comment || '').trim().slice(0, 500)
        };
        if (!isDate(data.date) || !isTime(data.time)) return res.status(400).json({ ok: false, error: 'Выберите день и время.' });
        const b = await lib.reserve(data);
        if (!b) return res.status(409).json({ ok: false, error: 'Это время уже занято.' });
        await notify(b, '✍️ Добавлено из приложения');
        return res.status(200).json({ ok: true, booking: view(b) });
      }

      case 'close': {
        const date = clean(body.date, 10);
        const type = lib.CLOSE_TYPES[body.type] ? body.type : 'dayoff';
        if (!isDate(date)) return res.status(400).json({ ok: false, error: 'Выберите день.' });
        // Открытый вами выходной снова делаем обычным выходным (без заметки — просто вернуть правило)
        if (lib.isWeekend(date) && type === 'dayoff' && !clean(body.note, 200) && !(await lib.takenSlots(date)).length) {
          await lib.closeWeekend(date);
          return res.status(200).json({ ok: true, booking: { id: `wk:${date}`, date, time: lib.WHOLE_DAY, status: 'new', source: 'manual', closeType: 'dayoff', name: '', weekend: true } });
        }
        const b = await lib.reserve({ date, time: lib.WHOLE_DAY, source: 'manual', closeType: type, name: clean(body.note, 200), service: '', phone: '', email: '', comment: '' });
        if (!b) return res.status(409).json({ ok: false, error: 'Этот день уже закрыт.' });
        return res.status(200).json({ ok: true, booking: view(b) });
      }

      case 'cancel': {
        // «Открыть день» для выходного по умолчанию
        const wk = /^wk:(\d{4}-\d{2}-\d{2})$/.exec(String(body.id || ''));
        if (wk) {
          await lib.openWeekend(wk[1]);
          return res.status(200).json({ ok: true, booking: { id: body.id, date: wk[1] } });
        }
        const b = await lib.cancel(clean(body.id, 20), 'owner', 'в приложении');
        if (!b) return res.status(404).json({ ok: false, error: 'Запись уже отменена.' });
        await lib.syncOwnerMessage(b, 'cancelled');
        if (b.time !== lib.WHOLE_DAY) await mail.notifyClient('cancelledByOwner', b);
        return res.status(200).json({ ok: true, booking: view(b) });
      }

      case 'confirm': {
        const { b, already } = await lib.confirmBooking(clean(body.id, 20));
        if (!b) return res.status(404).json({ ok: false, error: 'Запись не найдена.' });
        if (!already) {
          await mail.notifyClient('confirmed', b);
          await lib.syncOwnerMessage(b); // в чате убираем кнопку «Подтвердить»
        }
        return res.status(200).json({ ok: true, booking: view(b), already: !!already });
      }

      case 'stats': {
        const month = String(body.month || '');
        if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ ok: false, error: 'Неверный месяц.' });
        const [y, m] = month.split('-').map(Number);
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const [counters, list] = await Promise.all([lib.getStats(month), lib.rangeBookings(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`)]);
        // Загрузка по дням недели — по записям, которые назначены на этот месяц
        const weekdays = [0, 0, 0, 0, 0, 0, 0];
        list.filter((b) => b.time !== lib.WHOLE_DAY).forEach((b) => {
          const [yy, mm, dd] = b.date.split('-').map(Number);
          weekdays[(new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() + 6) % 7]++;
        });
        return res.status(200).json({ ok: true, month, counters, scheduled: list.filter((b) => b.time !== lib.WHOLE_DAY).length, weekdays, mail: mail.hasMail() });
      }

      default:
        return res.status(400).json({ ok: false, error: 'Неизвестное действие.' });
    }
  } catch (e) {
    console.error('app:', e.message);
    return res.status(500).json({ ok: false, error: 'Что-то пошло не так. Попробуйте ещё раз.' });
  }
};
