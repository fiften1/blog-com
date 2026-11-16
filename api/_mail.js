/* =====================================================================
   Письма клиентам (через вашу почту Gmail).
   Переменные окружения в Vercel:
     GMAIL_USER          — ваш адрес Gmail, например name@gmail.com
     GMAIL_APP_PASSWORD  — «пароль приложения» Google (16 букв), НЕ обычный пароль
     MAIL_FROM_NAME      — имя отправителя (необязательно, по умолчанию «Denys Savenko»)
   Если переменных нет — письма просто не отправляются, всё остальное работает.
   ===================================================================== */
const lib = require('./_lib');

const hasMail = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
const FROM_NAME = () => process.env.MAIL_FROM_NAME || 'Denys Savenko';

let transport = null;
function getTransport() {
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
  }
  return transport;
}

// Файл-приглашение (.ics), чтобы клиент добавил запись в свой календарь.
// Время «плавающее» (без часового пояса) — календарь покажет его как местное.
function icsFor(b, durationMin = 60) {
  const [y, m, d] = b.date.split('-');
  const [hh, mm] = b.time.split(':').map(Number);
  const end = hh * 60 + mm + durationMin;
  const t = (h, mi) => `${String(h).padStart(2, '0')}${String(mi).padStart(2, '0')}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const line = (s) => s.replace(/[,;\\]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//blog-com//booking//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${b.id}@blog-com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${y}${m}${d}T${t(hh, mm)}`,
    `DTEND:${y}${m}${d}T${t(Math.floor(end / 60), end % 60)}`,
    `SUMMARY:${line(`${svc(b) || (isPl(b) ? 'Wizyta' : 'Запись')} — ${FROM_NAME()}`)}`,
    `DESCRIPTION:${line(`${isPl(b) ? 'Zmień lub odwołaj' : 'Изменить или отменить'}: ${lib.manageUrl(b)}`)}`,
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

// Общий шаблон письма: простой, светлый, читается в любой почте
function layout({ title, intro, b, button, note }) {
  const e = lib.esc;
  const pl = isPl(b);
  const row = (k, v) => (v ? `<tr><td style="padding:8px 0;color:#6b6b78;width:120px;vertical-align:top">${k}</td><td style="padding:8px 0;color:#0f0f14">${v}</td></tr>` : '');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#2a2a33">
  <div style="max-width:520px;margin:0 auto;padding:28px 16px">
    <div style="font-size:13px;color:#6b6b78;margin-bottom:14px">${e(FROM_NAME())}</div>
    <div style="background:#fff;border-radius:16px;padding:28px 24px;border:1px solid #e7e7ec">
      <h1 style="margin:0 0 10px;font-size:22px;line-height:1.25;color:#0f0f14;font-weight:600">${e(title)}</h1>
      <p style="margin:0 0 18px">${intro}</p>
      ${b ? `<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:20px">
        ${row(pl ? 'Usługa' : 'Услуга', e(svc(b)))}${row(pl ? 'Kiedy' : 'Когда', `<b>${e(dateLong(b))}, ${e(b.time)}</b>`)}${row(pl ? 'Imię' : 'Имя', e(b.name))}
      </table>` : ''}
      ${button ? `<a href="${e(button.url)}" style="display:inline-block;background:#0f0f14;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">${e(button.text)}</a>` : ''}
      ${note ? `<p style="margin:18px 0 0;font-size:13px;color:#6b6b78">${note}</p>` : ''}
    </div>
    <p style="font-size:12px;color:#9a9aa6;margin:16px 4px 0">${pl
      ? `Ta wiadomość została wysłana, ponieważ zostawiono zgłoszenie na stronie ${e(lib.siteHost() || '')}. Jeśli to nie Ty — po prostu ją zignoruj.`
      : `Это письмо отправлено, потому что вы оставили заявку на сайте ${e(lib.siteHost() || '')}. Если это были не вы — просто проигнорируйте его.`}</p>
  </div></body></html>`;
  return html;
}

/* ---------- Язык клиента: b.lang = 'pl' → письма и Telegram по-польски ---------- */
const isPl = (b) => !!b && b.lang === 'pl';
// стандартные услуги — по-польски; свои названия из админки остаются как есть
const SVC_PL = { 'Создание сайта': 'Tworzenie strony', 'Монтаж видео': 'Montaż wideo', 'Дизайн': 'Projektowanie', 'Консультация': 'Konsultacja', 'Другое': 'Inne' };
const svc = (b) => (isPl(b) ? SVC_PL[b.service] || b.service || '' : b.service || '');
const plDate = (iso, opts) => { const [y, m, d] = iso.split('-').map(Number); return new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', ...opts }).format(new Date(Date.UTC(y, m - 1, d))); };
const dateLong = (b) => (isPl(b) ? plDate(b.date, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) : lib.humanDate(b.date));
const dateShort = (b) => (isPl(b) ? plDate(b.date, { day: 'numeric', month: 'short', weekday: 'short' }) : lib.humanDate(b.date, true));
const soonDayPl = (b) => (b.date === lib.todayISO() ? 'Dziś' : b.date === lib.addDays(lib.todayISO(), 1) ? 'Jutro' : dateShort(b));

const TEMPLATES_PL = {
  received: (b) => ({
    subject: `Zgłoszenie przyjęte: ${dateShort(b)}, ${b.time}`,
    title: 'Zgłoszenie przyjęte',
    intro: 'Dziękuję! Otrzymałem Twoje zgłoszenie i wkrótce się odezwę, aby potwierdzić termin.',
    button: { text: 'Zmień lub odwołaj', url: lib.manageUrl(b) },
    note: 'Jeśli plany się zmienią — przełóż lub odwołaj wizytę przyciskiem powyżej, termin zwolni się dla innych.',
    ics: true
  }),
  confirmed: (b) => ({
    subject: `Wizyta potwierdzona: ${dateShort(b)}, ${b.time}`,
    title: 'Wizyta potwierdzona ✅',
    intro: 'Wszystko aktualne — czekam na Ciebie w ustalonym terminie.',
    button: { text: 'Zmień lub odwołaj', url: lib.manageUrl(b) },
    ics: true
  }),
  reminder: (b) => ({
    subject: `Przypomnienie: jutro o ${b.time}`,
    title: 'Przypominam o jutrzejszej wizycie',
    intro: `Jutro, ${lib.esc(dateLong(b))}, o <b>${lib.esc(b.time)}</b>.`,
    button: { text: 'Nie dam rady — przełóż lub odwołaj', url: lib.manageUrl(b) }
  }),
  soon: (b) => ({
    subject: `Wkrótce wizyta: ${soonDayPl(b).toLowerCase()} o ${b.time}`,
    title: 'Wkrótce Twoja wizyta ⏰',
    intro: `${soonDayPl(b)} o <b>${lib.esc(b.time)}</b> — ${b.leftMin >= 75 ? 'mniej więcej za półtorej godziny' : 'mniej więcej za godzinę'}. Do zobaczenia!`,
    button: { text: 'Nie zdążę — przełóż', url: lib.manageUrl(b) }
  }),
  moved: (b) => ({
    subject: `Wizyta przełożona: ${dateShort(b)}, ${b.time}`,
    title: 'Wizyta przełożona',
    intro: 'Gotowe, nowy termin poniżej.',
    button: { text: 'Zmień lub odwołaj', url: lib.manageUrl(b) },
    ics: true
  }),
  cancelledByClient: (b) => ({
    subject: `Wizyta odwołana: ${dateShort(b)}, ${b.time}`,
    title: 'Wizyta odwołana',
    intro: 'Odwołano wizytę. Jeśli zechcesz umówić się ponownie — możesz to zrobić na stronie.',
    button: { text: 'Umów się ponownie', url: `https://${lib.siteHost()}/#booking` }
  }),
  cancelledByOwner: (b) => ({
    subject: `Wizyta odwołana: ${dateShort(b)}, ${b.time}`,
    title: 'Wizyta odwołana',
    intro: 'Niestety musiałem odwołać tę wizytę — przepraszam. Wybierz, proszę, inny dogodny termin: nie trzeba ponownie wypełniać formularza, Twoje dane są zapisane.',
    button: { text: 'Wybierz inny termin', url: lib.manageUrl(b) },
    note: 'Link jest ważny 30 dni. Jeśli wolisz — po prostu odpowiedz na tę wiadomość.'
  }),
  rebooked: (b) => ({
    subject: `Nowy termin wizyty: ${dateShort(b)}, ${b.time}`,
    title: 'Zarezerwowałem nowy termin',
    intro: 'Dziękuję za wybór innego terminu! Wkrótce potwierdzę wizytę.',
    button: { text: 'Zmień lub odwołaj', url: lib.manageUrl(b) },
    ics: true
  })
};
// шаблон на языке клиента
const tpl = (kind, b) => ((isPl(b) ? TEMPLATES_PL : TEMPLATES)[kind] || TEMPLATES[kind])(b);

// «Сегодня» / «Завтра» — напоминание может прийти до полуночи о записи после неё
const soonDay = (b) => (b.date === lib.todayISO() ? 'Сегодня' : b.date === lib.addDays(lib.todayISO(), 1) ? 'Завтра' : lib.humanDate(b.date, true));

const TEMPLATES = {
  // сразу после заявки с сайта
  received: (b) => ({
    subject: `Заявка получена: ${lib.humanDate(b.date, true)}, ${b.time}`,
    title: 'Заявка получена',
    intro: 'Спасибо! Я получил вашу заявку и скоро свяжусь, чтобы подтвердить время.',
    button: { text: 'Изменить или отменить', url: lib.manageUrl(b) },
    note: 'Если планы поменяются — перенесите или отмените запись по кнопке выше, время освободится для других.',
    ics: true
  }),
  // когда вы нажали «Подтвердить»
  confirmed: (b) => ({
    subject: `Запись подтверждена: ${lib.humanDate(b.date, true)}, ${b.time}`,
    title: 'Запись подтверждена ✅',
    intro: 'Всё в силе — жду вас в назначенное время.',
    button: { text: 'Изменить или отменить', url: lib.manageUrl(b) },
    ics: true
  }),
  // напоминание накануне (утром)
  reminder: (b) => ({
    subject: `Напоминание: завтра в ${b.time}`,
    title: 'Напоминаю о записи завтра',
    intro: `Завтра, ${lib.esc(lib.humanDate(b.date))}, в <b>${lib.esc(b.time)}</b>.`,
    button: { text: 'Не смогу — перенести или отменить', url: lib.manageUrl(b) }
  }),
  // за час до записи
  soon: (b) => ({
    subject: `Скоро запись: ${soonDay(b).toLowerCase()} в ${b.time}`,
    title: 'Скоро ваша запись ⏰',
    intro: `${soonDay(b)} в <b>${lib.esc(b.time)}</b> — ${b.leftMin >= 75 ? 'примерно через полтора часа' : 'примерно через час'}. До встречи!`,
    button: { text: 'Не успеваю — перенести', url: lib.manageUrl(b) }
  }),
  // клиент перенёс сам
  moved: (b) => ({
    subject: `Запись перенесена: ${lib.humanDate(b.date, true)}, ${b.time}`,
    title: 'Запись перенесена',
    intro: 'Готово, новое время ниже.',
    button: { text: 'Изменить или отменить', url: lib.manageUrl(b) },
    ics: true
  }),
  // клиент отменил сам
  cancelledByClient: (b) => ({
    subject: `Запись отменена: ${lib.humanDate(b.date, true)}, ${b.time}`,
    title: 'Запись отменена',
    intro: 'Вы отменили запись. Если захотите записаться снова — это можно сделать на сайте.',
    button: { text: 'Записаться снова', url: `https://${lib.siteHost()}/#booking` }
  }),
  // вы отменили
  cancelledByOwner: (b) => ({
    subject: `Запись отменена: ${lib.humanDate(b.date, true)}, ${b.time}`,
    title: 'Запись отменена',
    intro: 'К сожалению, эту запись пришлось отменить — приношу извинения. Выберите, пожалуйста, другое удобное время: заполнять анкету заново не нужно, ваши данные сохранены.',
    button: { text: 'Выбрать другое время', url: lib.manageUrl(b) },
    note: 'Ссылка действует 30 дней. Если удобнее — просто ответьте на это письмо.'
  }),
  // клиент выбрал новое время после вашей отмены
  rebooked: (b) => ({
    subject: `Новое время записи: ${lib.humanDate(b.date, true)}, ${b.time}`,
    title: 'Записал вас на новое время',
    intro: 'Спасибо, что выбрали другое время! Скоро подтвержу запись.',
    button: { text: 'Изменить или отменить', url: lib.manageUrl(b) },
    ics: true
  })
};

// Отправить письмо клиенту. Ошибки не роняют основное действие — только пишутся в лог.
async function sendToClient(kind, b) {
  if (!hasMail() || !b || !b.email || !TEMPLATES[kind] || !lib.siteHost()) return false;
  const t = tpl(kind, b);
  const pl = isPl(b);
  try {
    await getTransport().sendMail({
      from: { name: FROM_NAME(), address: process.env.GMAIL_USER },
      to: b.email,
      replyTo: process.env.GMAIL_USER,
      subject: t.subject,
      html: layout({ title: t.title, intro: t.intro, b, button: t.button, note: t.note }),
      text: `${t.title}\n\n${t.intro.replace(/<[^>]+>/g, '')}\n\n${b.service ? `${pl ? 'Usługa' : 'Услуга'}: ${svc(b)}\n` : ''}${pl ? 'Kiedy' : 'Когда'}: ${dateLong(b)}, ${b.time}\n\n${t.button ? `${t.button.text}: ${t.button.url}` : ''}`,
      icalEvent: t.ics ? { filename: pl ? 'wizyta.ics' : 'zapis.ics', method: 'PUBLISH', content: icsFor(b) } : undefined
    });
    return true;
  } catch (e) {
    console.error(`mail(${kind}):`, e.message);
    return false;
  }
}

// То же сообщение — в Telegram клиента, если он подключил его в кабинете
async function telegramToClient(kind, b) {
  if (!b || !b.email || !TEMPLATES[kind] || !lib.hasDb() || !lib.BOT()) return false;
  try {
    const link = await lib.telegramOf(b.email);
    if (!link) return false;
    const t = tpl(kind, b);
    const when = `${dateLong(b)}, ${b.time}`;
    await lib.clientTg('sendMessage', {
      chat_id: link.chatId, parse_mode: 'HTML', disable_web_page_preview: true,
      text: `<b>${lib.esc(t.title)}</b>\n${t.intro}\n\n${b.service ? `${lib.esc(svc(b))}\n` : ''}🗓 <b>${lib.esc(when)}</b>`,
      reply_markup: t.button ? { inline_keyboard: [[{ text: t.button.text, url: t.button.url }]] } : undefined
    });
    return true;
  } catch (e) {
    console.error(`telegram(${kind}):`, e.message);
    return false;
  }
}

// Уведомить клиента: письмо + Telegram (если подключён). onlyOne — достаточно одного канала
async function notifyClient(kind, b, { onlyOne = false } = {}) {
  const viaTg = await telegramToClient(kind, b);
  if (onlyOne && viaTg) return true;
  const viaMail = await sendToClient(kind, b);
  return viaTg || viaMail;
}

module.exports = { hasMail, sendToClient, notifyClient, telegramToClient, icsFor, layout, TEMPLATES, TEMPLATES_PL, tpl };
