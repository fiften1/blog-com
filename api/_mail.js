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
    `SUMMARY:${line(`${b.service || 'Запись'} — ${FROM_NAME()}`)}`,
    `DESCRIPTION:${line(`Изменить или отменить: ${lib.manageUrl(b)}`)}`,
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

// Общий шаблон письма: простой, светлый, читается в любой почте
function layout({ title, intro, b, button, note }) {
  const e = lib.esc;
  const row = (k, v) => (v ? `<tr><td style="padding:8px 0;color:#6b6b78;width:120px;vertical-align:top">${k}</td><td style="padding:8px 0;color:#0f0f14">${v}</td></tr>` : '');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#2a2a33">
  <div style="max-width:520px;margin:0 auto;padding:28px 16px">
    <div style="font-size:13px;color:#6b6b78;margin-bottom:14px">${e(FROM_NAME())}</div>
    <div style="background:#fff;border-radius:16px;padding:28px 24px;border:1px solid #e7e7ec">
      <h1 style="margin:0 0 10px;font-size:22px;line-height:1.25;color:#0f0f14;font-weight:600">${e(title)}</h1>
      <p style="margin:0 0 18px">${intro}</p>
      ${b ? `<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;border-bottom:1px solid #eee;margin-bottom:20px">
        ${row('Услуга', e(b.service))}${row('Когда', `<b>${e(lib.humanDate(b.date))}, ${e(b.time)}</b>`)}${row('Имя', e(b.name))}
      </table>` : ''}
      ${button ? `<a href="${e(button.url)}" style="display:inline-block;background:#0f0f14;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">${e(button.text)}</a>` : ''}
      ${note ? `<p style="margin:18px 0 0;font-size:13px;color:#6b6b78">${note}</p>` : ''}
    </div>
    <p style="font-size:12px;color:#9a9aa6;margin:16px 4px 0">Это письмо отправлено, потому что вы оставили заявку на сайте ${e(lib.siteHost() || '')}. Если это были не вы — просто проигнорируйте его.</p>
  </div></body></html>`;
  return html;
}

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
    intro: 'К сожалению, эту запись пришлось отменить. Выберите, пожалуйста, другое удобное время на сайте — или ответьте на это письмо.',
    button: { text: 'Выбрать другое время', url: `https://${lib.siteHost()}/#booking` }
  })
};

// Отправить письмо клиенту. Ошибки не роняют основное действие — только пишутся в лог.
async function sendToClient(kind, b) {
  if (!hasMail() || !b || !b.email || !TEMPLATES[kind] || !lib.siteHost()) return false;
  const t = TEMPLATES[kind](b);
  try {
    await getTransport().sendMail({
      from: { name: FROM_NAME(), address: process.env.GMAIL_USER },
      to: b.email,
      replyTo: process.env.GMAIL_USER,
      subject: t.subject,
      html: layout({ title: t.title, intro: t.intro, b, button: t.button, note: t.note }),
      text: `${t.title}\n\n${t.intro.replace(/<[^>]+>/g, '')}\n\n${b.service ? `Услуга: ${b.service}\n` : ''}Когда: ${lib.humanDate(b.date)}, ${b.time}\n\n${t.button ? `${t.button.text}: ${t.button.url}` : ''}`,
      icalEvent: t.ics ? { filename: 'zapis.ics', method: 'PUBLISH', content: icsFor(b) } : undefined
    });
    return true;
  } catch (e) {
    console.error(`mail(${kind}):`, e.message);
    return false;
  }
}

module.exports = { hasMail, sendToClient, icsFor, layout, TEMPLATES };
