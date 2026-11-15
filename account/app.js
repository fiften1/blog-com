/* =====================================================================
   ЛИЧНЫЙ КАБИНЕТ (/account)
   Вход через Google, вкладки: Записи · Новая запись · История ·
   Сохранённое · Активность · Профиль. Данные — /api/account.
   ===================================================================== */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const human = (iso) => { const d = new Date(`${iso}T00:00:00`); return isNaN(d) ? iso : new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }).format(d); };
  const dateLong = (ts) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts));
  const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
  const params = new URLSearchParams(location.search);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const I = {
    cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    chat: '<path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>'
  };
  const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;

  const st = {
    user: null, clientId: null, enabled: false, profile: null, bookings: [], history: [], favorites: [], likes: [],
    comments: [], reviews: [], telegram: { linked: false }, tab: params.get('tab') || 'bookings',
    site: {}, posts: [], files: [], bookService: ''
  };

  /* ---------- API ---------- */
  async function api(data, full) {
    const r = await fetch(data ? '/api/account' : `/api/account${full ? '?full=1' : ''}`, {
      method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.ok) throw Object.assign(new Error(out.error || 'Ошибка сети. Попробуйте ещё раз.'), out, { status: r.status });
    return out;
  }
  const apply = (out) => {
    ['user', 'clientId', 'enabled', 'profile', 'bookings', 'history', 'favorites', 'likes', 'comments', 'reviews', 'telegram']
      .forEach((k) => { if (out[k] !== undefined) st[k] = out[k]; });
  };
  async function reload() { apply(await api(null, true)); render(); }

  let toastT;
  function toast(text, err) {
    const t = $('#toast'); t.textContent = text; t.classList.toggle('is-error', !!err); t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 3000);
  }

  /* ---------- Вход ---------- */
  let gsiP = null;
  const loadGsi = () => gsiP || (gsiP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => { gsiP = null; rej(new Error('Не удалось загрузить вход Google.')); };
    document.head.appendChild(s);
  }));
  function renderLogin() {
    $('#acc').innerHTML = `
      <div class="login-card">
        <h1>Личный кабинет</h1>
        <p>Войдите через Google, чтобы управлять записями.</p>
        <div id="gsi"></div>
        <p class="msg" id="lmsg"></p>
        <ul>
          <li>записи, перенос и отмена в пару кликов;</li>
          <li>запись без анкеты и история визитов;</li>
          <li>напоминания в Telegram за час до визита;</li>
          <li>сохранённые посты и файлы.</li>
        </ul>
        <p class="small" style="margin:18px 0 0;font-size:.8rem">Сайт получит только имя, почту и фото профиля. <a href="../privacy/">Подробнее</a></p>
      </div>`;
    if (!st.enabled) { $('#gsi').innerHTML = '<p class="msg">Вход пока не настроен.</p>'; return; }
    loadGsi().then(() => {
      google.accounts.id.initialize({
        client_id: st.clientId, ux_mode: 'popup',
        callback: async (resp) => {
          $('#lmsg').textContent = 'Вхожу…'; $('#lmsg').className = 'msg is-ok';
          try {
            await api({ action: 'login', credential: resp.credential });
            const back = params.get('back');
            if (back && back.startsWith('/') && !back.startsWith('//')) { location.href = back; return; }
            await reload();
          } catch (e) { $('#lmsg').textContent = e.message; $('#lmsg').className = 'msg'; }
        }
      });
      const dark = document.documentElement.dataset.theme !== 'light';
      google.accounts.id.renderButton($('#gsi'), { theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ru' });
    }).catch((e) => { $('#lmsg').textContent = e.message; });
  }

  /* ---------- Каркас ---------- */
  const TABS = [
    ['bookings', 'cal', 'Записи', () => st.bookings.filter((b) => !b.cancelled).length],
    ['new', 'plus', 'Новая запись'],
    ['history', 'hist', 'История', () => st.history.length],
    ['saved', 'star', 'Сохранённое', () => st.favorites.length],
    ['activity', 'chat', 'Активность', () => st.comments.length + st.likes.length],
    ['profile', 'user', 'Профиль']
  ];
  function render() {
    if (!st.user) return renderLogin();
    const u = st.user;
    const name = (st.profile && st.profile.name) || u.name || u.email;
    if (!TABS.some((t) => t[0] === st.tab)) st.tab = 'bookings';
    $('#acc').innerHTML = `
      <section class="acc-hero">
        ${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="ava">${esc(name[0].toUpperCase())}</span>`}
        <div><h1>${esc(name)}</h1><p>${esc(u.email)}${st.telegram.linked ? ' · Telegram подключён' : ''}</p></div>
      </section>
      <div class="acc-grid">
        <nav class="tabs" aria-label="Разделы кабинета">
          ${TABS.map(([id, ic, label, cnt]) => `<button class="tab ${st.tab === id ? 'is-on' : ''}" data-tab="${id}">${svg(ic)}<span>${label}</span>${cnt && cnt() ? `<b>${cnt()}</b>` : ''}</button>`).join('')}
          <button class="tab tab--out" data-logout>${svg('out')}<span>Выйти</span></button>
        </nav>
        <section class="pane" id="pane"></section>
      </div>`;
    ({ bookings: paneBookings, new: paneNew, history: paneHistory, saved: paneSaved, activity: paneActivity, profile: paneProfile })[st.tab]();
  }
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { st.tab = t.dataset.tab; history.replaceState(null, '', `?tab=${st.tab}`); render(); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); return; }
    if (e.target.closest('[data-logout]')) {
      try { await api({ action: 'logout' }); } catch (err) { /* всё равно выходим */ }
      try { google.accounts.id.disableAutoSelect(); } catch (err) { /* нет скрипта */ }
      st.user = null; history.replaceState(null, '', location.pathname); render();
    }
  });
  const go = (tab) => { st.tab = tab; history.replaceState(null, '', `?tab=${tab}`); render(); };

  /* ---------- Свободное время на дату ---------- */
  async function freeTimes(date, exclude) {
    let taken = [], closed = null;
    try { const r = await (await fetch(`/api/slots?date=${date}`, { cache: 'no-store' })).json(); taken = r.taken || []; closed = r.closed; } catch (e) { /* нет сервера */ }
    const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes() + 30;
    const isToday = date === isoLocal(now);
    const slots = (st.site.slots && st.site.slots.length) ? st.site.slots : ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
    return {
      closed,
      slots: slots.map((t) => {
        const [h, m] = t.split(':').map(Number);
        const off = !!closed || taken.includes(t) || (isToday && h * 60 + m < nowMin) || (exclude && exclude.date === date && exclude.time === t);
        return { t, off };
      })
    };
  }
  const dateLimits = (el) => { const max = new Date(); max.setDate(max.getDate() + 60); el.min = isoLocal(new Date()); el.max = isoLocal(max); };

  /* ---------- Вкладка «Записи» ---------- */
  function paneBookings() {
    const list = st.bookings;
    $('#pane').innerHTML = `
      <h2>Мои записи</h2><p class="sub">Будущие визиты. Статус обновляется сам.</p>
      ${list.length ? `<div class="mybk">${list.map((b) => `
        <article class="mybk__item ${b.cancelled ? 'is-cancelled' : ''}" data-id="${esc(b.id)}">
          <div class="mybk__when">${esc(human(b.date))}, ${esc(b.time)}</div>
          <div class="mybk__meta">${b.service ? `<span>${esc(b.service)}</span>` : ''}
            ${b.cancelled ? '<span class="mybk__status is-off">отменена</span>' : `<span class="mybk__status ${b.status === 'confirmed' ? 'is-ok' : 'is-new'}">${b.status === 'confirmed' ? 'подтверждено' : 'ждёт подтверждения'}</span>`}</div>
          ${b.cancelled ? '<p class="mybk__sorry">К сожалению, эту запись пришлось отменить — приношу извинения. Выберите другое время: ваши данные сохранены.</p>' : ''}
          <div class="mybk__actions">
            ${b.cancelled
              ? '<button class="btn btn--primary btn--sm" data-act="move">Выбрать другое время</button><button class="btn btn--ghost btn--sm" data-act="dismiss">Скрыть</button>'
              : '<button class="btn btn--ghost btn--sm" data-act="move">Перенести</button><button class="btn btn--ghost btn--sm btn--danger" data-act="cancel">Отменить</button>'}
          </div>
          <div class="mybk__move">
            <div class="form__row">
              <label class="field"><span class="form__label">Дата</span><input type="date" data-f="date"></label>
              <label class="field"><span class="form__label">Время</span><select data-f="time"><option value="">Сначала дата</option></select></label>
            </div>
            <button class="btn btn--primary btn--sm" data-act="save" disabled>${b.cancelled ? 'Записаться на это время' : 'Перенести на это время'}</button>
          </div>
        </article>`).join('')}</div>`
        : `<div class="empty">Будущих записей нет.<br><button class="btn btn--primary btn--sm" data-go="new">Записаться</button></div>`}
      <p class="msg" id="bmsg"></p>`;
    const msg = (t, ok) => { const m = $('#bmsg'); m.textContent = t; m.className = `msg ${ok ? 'is-ok' : ''}`; };
    $('#pane').onchange = async (e) => {
      const item = e.target.closest('.mybk__item'); if (!item) return;
      const b = st.bookings.find((x) => x.id === item.dataset.id);
      if (e.target.dataset.f === 'date') {
        const sel = item.querySelector('[data-f="time"]');
        sel.innerHTML = '<option value="">Загружаю…</option>';
        const { slots, closed } = await freeTimes(e.target.value, b.cancelled ? null : b);
        const free = slots.filter((s) => !s.off);
        sel.innerHTML = free.length ? '<option value="">Выбрать</option>' + free.map((s) => `<option>${s.t}</option>`).join('') : `<option value="">${closed ? esc(closed) + ' — записи нет' : 'Свободного времени нет'}</option>`;
        item.querySelector('[data-act="save"]').disabled = true;
      }
      if (e.target.dataset.f === 'time') item.querySelector('[data-act="save"]').disabled = !e.target.value;
    };
    $('#pane').onclick = async (e) => {
      if (e.target.closest('[data-go]')) return go(e.target.closest('[data-go]').dataset.go);
      const a = e.target.closest('[data-act]'); if (!a) return;
      const item = a.closest('.mybk__item'); const b = st.bookings.find((x) => x.id === item.dataset.id);
      const act = a.dataset.act;
      if (act === 'move') { const box = item.querySelector('.mybk__move'); box.classList.toggle('is-open'); dateLimits(item.querySelector('[data-f="date"]')); return; }
      try {
        if (act === 'cancel') {
          if (!confirm(`Отменить запись на ${human(b.date)}, ${b.time}?`)) return;
          a.disabled = true; apply(await api({ action: 'cancel', id: b.id })); render(); toast('Запись отменена');
        }
        if (act === 'dismiss') { a.disabled = true; apply(await api({ action: 'dismiss', id: b.id })); render(); }
        if (act === 'save') {
          const date = item.querySelector('[data-f="date"]').value, time = item.querySelector('[data-f="time"]').value;
          a.disabled = true;
          apply(await api({ action: b.cancelled ? 'rebook' : 'move', id: b.id, date, time }));
          render(); toast(`Готово: ${human(date)}, ${time}`);
        }
      } catch (err) { a.disabled = false; msg(err.message); }
    };
  }

  /* ---------- Вкладка «Новая запись» ---------- */
  function paneNew() {
    const prof = st.profile || {};
    const services = (st.site.services && st.site.services.length) ? st.site.services : ['Создание сайта', 'Монтаж видео', 'Дизайн', 'Консультация', 'Другое'];
    const pick = { service: st.bookService || '', date: '', time: '' };
    st.bookService = '';
    $('#pane').innerHTML = `
      <h2>Новая запись</h2><p class="sub">Анкету заполнять не нужно — данные берутся из профиля.</p>
      <div class="box">
        <div class="step" data-step="service"><span class="form__label">Услуга</span>
          <div class="chips">${services.map((s) => `<label><input type="radio" name="svc" value="${esc(s)}" ${s === pick.service ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div></div>
        <div class="step" data-step="date"><label class="form__label" for="ndate">Дата</label><div class="field" style="max-width:240px"><input type="date" id="ndate"></div></div>
        <div class="step" data-step="time"><span class="form__label">Время</span><div class="times" id="ntimes"><span class="small" style="color:var(--text-faint)">Сначала выберите дату</span></div></div>
        <div class="step"><label class="form__label" for="ncom">Комментарий — необязательно</label><div class="field"><textarea id="ncom" rows="2" maxlength="1000" placeholder="Коротко о задаче"></textarea></div></div>
        <div class="who">Записываем: <b>${esc(prof.name || st.user.name || '')}</b> · <b>${esc(prof.phone || 'телефон не указан')}</b> · <b>${esc(st.user.email)}</b><button data-go="profile">изменить</button></div>
        <div style="margin-top:16px"><button class="btn btn--primary" id="nsave">Записаться</button><span class="nsave-hint" id="nhint"></span></div>
        <p class="msg" id="nmsg"></p>
      </div>`;
    // Кнопка всегда активна; подсказка рядом говорит, чего не хватает
    const missing = () => [!pick.service && ['service', 'услугу'], !pick.date && ['date', 'дату'], !pick.time && ['time', 'время']].filter(Boolean);
    const check = () => {
      const m = missing();
      $('#nhint').textContent = m.length ? `Осталось выбрать: ${m.map((x) => x[1]).join(', ')}` : '';
      $$('#pane .step.is-missing').forEach((s) => { if (!m.some((x) => x[0] === s.dataset.step)) s.classList.remove('is-missing'); });
      if (!m.length) $('#nmsg').textContent = '';
    };
    check();
    dateLimits($('#ndate'));
    $('#pane').onchange = async (e) => {
      if (e.target.name === 'svc') { pick.service = e.target.value; check(); }
      if (e.target.id === 'ndate') {
        pick.date = e.target.value; pick.time = ''; check();
        const box = $('#ntimes'); box.innerHTML = '<span class="small">Загружаю…</span>';
        const { slots, closed } = await freeTimes(pick.date);
        box.innerHTML = closed ? `<span class="small" style="color:var(--pink)">${esc(closed)} — в этот день записи нет</span>`
          : slots.map((s) => `<button type="button" data-t="${s.t}" ${s.off ? 'disabled' : ''}>${s.t}</button>`).join('');
      }
    };
    $('#pane').onclick = async (e) => {
      if (e.target.closest('[data-go]')) return go('profile');
      const tb = e.target.closest('[data-t]');
      if (tb) { pick.time = tb.dataset.t; $$('#ntimes button').forEach((b) => b.classList.toggle('is-on', b === tb)); check(); return; }
      if (e.target.id === 'nsave') {
        const m = missing();
        if (m.length) {
          $('#nmsg').textContent = `Выберите ${m.map((x) => x[1]).join(', ')}.`;
          m.forEach((x) => { const s = $(`#pane [data-step="${x[0]}"]`); s.classList.remove('is-missing'); void s.offsetWidth; s.classList.add('is-missing'); });
          $(`#pane [data-step="${m[0][0]}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        const btn = e.target; btn.disabled = true; btn.textContent = 'Отправляю…'; $('#nmsg').textContent = '';
        try {
          apply(await api({ action: 'book', ...pick, comment: $('#ncom').value }));
          toast(`Вы записаны: ${human(pick.date)}, ${pick.time}`); go('bookings');
        } catch (err) {
          $('#nmsg').textContent = err.message; btn.disabled = false; btn.textContent = 'Записаться';
          if (err.needPhone) setTimeout(() => go('profile'), 1200);
          if (err.taken) $('#ndate').dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    };
  }

  /* ---------- Вкладка «История» ---------- */
  function paneHistory() {
    const reviewOf = (id) => st.reviews.find((r) => r.bookingId === id);
    $('#pane').innerHTML = `
      <h2>История визитов</h2><p class="sub">Прошедшие записи за последние 2,5 месяца.</p>
      ${st.history.length ? `<div class="list">${st.history.map((b) => {
        const rv = reviewOf(b.id);
        return `<article class="box" data-id="${esc(b.id)}" style="margin:0">
          <div class="row-item__title">${esc(human(b.date))}, ${esc(b.time)}</div>
          <div class="row-item__meta">${esc(b.service || 'Запись')}${rv ? ` · ваш отзыв: ${'★'.repeat(rv.rating)} <span class="badge ${rv.status === 'published' ? 'badge--ok' : 'badge--wait'}">${rv.status === 'published' ? 'опубликован' : 'на проверке'}</span>` : ''}</div>
          <div class="mybk__actions" style="margin-top:12px">
            <button class="btn btn--ghost btn--sm" data-again="${esc(b.service || '')}">Записаться снова</button>
            ${rv ? '' : '<button class="btn btn--ghost btn--sm" data-rv>Оставить отзыв</button>'}
          </div>
          <div class="review-form">
            <div class="stars" role="radiogroup" aria-label="Оценка">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n}">★</button>`).join('')}</div>
            <div class="field"><textarea rows="3" maxlength="1000" placeholder="Как всё прошло? Отзыв появится на сайте после проверки."></textarea></div>
            <div><button class="btn btn--primary btn--sm" data-send>Отправить отзыв</button></div>
            <p class="msg"></p>
          </div>
        </article>`;
      }).join('')}</div>` : '<div class="empty">Прошедших визитов пока нет.</div>'}`;
    $('#pane').onclick = async (e) => {
      const again = e.target.closest('[data-again]');
      if (again) { st.bookService = again.dataset.again; return go('new'); }
      const card = e.target.closest('[data-id]'); if (!card) return;
      if (e.target.closest('[data-rv]')) { card.querySelector('.review-form').classList.toggle('is-open'); return; }
      const star = e.target.closest('[data-star]');
      if (star) { card.dataset.rating = star.dataset.star; $$('[data-star]', card).forEach((s) => s.classList.toggle('is-on', +s.dataset.star <= +star.dataset.star)); return; }
      if (e.target.closest('[data-send]')) {
        const btn = e.target.closest('[data-send]'); const m = $('.msg', card);
        btn.disabled = true;
        try {
          const out = await api({ action: 'review', bookingId: card.dataset.id, rating: +(card.dataset.rating || 0), text: $('textarea', card).value });
          toast(out.status === 'published' ? 'Спасибо! Отзыв опубликован' : 'Спасибо! Отзыв появится после проверки');
          await reload();
        } catch (err) { m.textContent = err.message; btn.disabled = false; }
      }
    };
  }

  /* ---------- Вкладка «Сохранённое» ---------- */
  function paneSaved() {
    const items = st.favorites.map((k) => {
      if (k.startsWith('post:')) { const p = st.posts.find((x) => x.id === k.slice(5)); return p && { k, kind: 'Пост', title: p.title, img: p.cover, href: `../#post-${p.id}`, meta: p.date }; }
      if (k.startsWith('file:')) { const f = st.files.find((x) => x.file === k.slice(5)); return f && { k, kind: 'Файл', title: f.title, href: `../${f.file}`, download: true, meta: f.description }; }
      return null;
    }).filter(Boolean);
    $('#pane').innerHTML = `
      <h2>Сохранённое</h2><p class="sub">Посты и файлы, отмеченные ☆ на сайте.</p>
      ${items.length ? `<div class="list">${items.map((it) => `
        <div class="row-item">
          ${it.img ? `<img class="row-item__thumb" src="${esc(/^https?:/.test(it.img) ? it.img : '../' + it.img)}" alt="">` : ''}
          <div class="row-item__main"><div class="row-item__title">${esc(it.title)}</div><div class="row-item__meta"><span>${it.kind}</span>${it.meta ? `<span>${esc(it.meta)}</span>` : ''}</div></div>
          <div class="row-item__actions"><a class="btn btn--ghost btn--sm" href="${esc(it.href)}" ${it.download ? 'download' : ''}>${it.download ? 'Скачать' : 'Открыть'}</a><button class="btn btn--ghost btn--sm" data-unfav="${esc(it.k)}">Убрать</button></div>
        </div>`).join('')}</div>`
        : '<div class="empty">Пока ничего не сохранено.<br>Нажмите ☆ на посте или файле на сайте.</div>'}`;
    $('#pane').onclick = async (e) => {
      const b = e.target.closest('[data-unfav]'); if (!b) return;
      b.disabled = true;
      try { const out = await api({ action: 'fav', key: b.dataset.unfav, on: false }); st.favorites = out.favorites; render(); } catch (err) { toast(err.message, true); b.disabled = false; }
    };
  }

  /* ---------- Вкладка «Активность» ---------- */
  function paneActivity() {
    const liked = st.likes.map((id) => st.posts.find((p) => p.id === id)).filter(Boolean);
    $('#pane').innerHTML = `
      <h2>Активность</h2><p class="sub">Ваши комментарии и понравившиеся посты.</p>
      <div class="box"><h3>Комментарии · ${st.comments.length}</h3>
        ${st.comments.length ? `<div class="list">${st.comments.map((c) => `
          <div class="row-item"><div class="row-item__main"><div class="row-item__title" style="white-space:normal">${esc(c.text)}</div>
            <div class="row-item__meta"><span>к посту «${esc(c.postTitle)}»</span><span>${esc(dateLong(c.ts))}</span></div></div>
            <div class="row-item__actions"><a class="btn btn--ghost btn--sm" href="../#post-${esc(c.postId)}">Открыть</a></div></div>`).join('')}</div>`
          : '<p class="small" style="color:var(--text-muted);margin:0">Вы ещё не комментировали.</p>'}
      </div>
      <div class="box"><h3>Понравилось · ${liked.length}</h3>
        ${liked.length ? `<div class="list">${liked.map((p) => `
          <div class="row-item">${p.cover ? `<img class="row-item__thumb" src="${esc(/^https?:/.test(p.cover) ? p.cover : '../' + p.cover)}" alt="">` : ''}
            <div class="row-item__main"><div class="row-item__title">${esc(p.title)}</div><div class="row-item__meta"><span>♥ лайк</span></div></div>
            <div class="row-item__actions"><a class="btn btn--ghost btn--sm" href="../#post-${esc(p.id)}">Открыть</a></div></div>`).join('')}</div>`
          : '<p class="small" style="color:var(--text-muted);margin:0">Лайки, поставленные после входа в кабинет, появятся здесь.</p>'}
      </div>`;
  }

  /* ---------- Вкладка «Профиль» ---------- */
  function paneProfile() {
    const prof = st.profile || {};
    const tg = st.telegram || {};
    $('#pane').innerHTML = `
      <h2>Профиль</h2><p class="sub">Эти данные подставляются в запись.</p>
      <div class="box"><h3>Контакты</h3>
        <div class="form-grid">
          <label class="field"><span class="form__label">Имя</span><input id="pname" maxlength="80" value="${esc(prof.name || st.user.name || '')}"></label>
          <label class="field"><span class="form__label">Телефон</span><input id="pphone" type="tel" maxlength="30" placeholder="+48 512 345 678" value="${esc(prof.phone || '')}"></label>
        </div>
        <p class="small" style="color:var(--text-faint);margin:8px 0 0;font-size:.8rem">Почта — из Google: ${esc(st.user.email)}. Телефон — с кодом страны.</p>
        <div style="margin-top:14px"><button class="btn btn--primary btn--sm" id="psave">Сохранить</button></div>
        <p class="msg" id="pmsg"></p>
      </div>
      <div class="box"><h3>Уведомления в Telegram</h3>
        <div class="tg">
          <span class="tg__icon"><svg viewBox="0 0 24 24"><path d="M21.5 4.2 2.9 11.4c-1.3.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.8.8.4 0 .6-.2.9-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.8c.3-1.3-.5-1.9-1.4-1.5zM8.7 14l9.3-5.9c.4-.3.8-.1.5.2l-7.8 7.1-.3 3.3z"/></svg></span>
          <div class="tg__text">${tg.linked
            ? `<b>Подключён${tg.name ? ` · ${esc(tg.name)}` : ''}</b><span>Подтверждения, переносы и напоминания — накануне и за час до визита.</span>`
            : '<b>Не подключён</b><span>Подключите, чтобы получать напоминания за час до визита и подтверждения записей.</span>'}</div>
          ${tg.linked ? '<button class="btn btn--ghost btn--sm" id="tgoff">Отключить</button>' : '<button class="btn btn--primary btn--sm" id="tgon">Подключить Telegram</button>'}
        </div>
      </div>
      <div class="box box--danger"><h3>Удалить мои данные</h3>
        <p class="small" style="color:var(--text-muted);margin:0 0 12px">Будущие записи отменятся, а профиль, история, комментарии, отзывы, сохранённое и привязка Telegram удалятся навсегда.</p>
        <button class="btn btn--ghost btn--sm btn--danger" id="pdel">Удалить всё</button>
      </div>`;
    $('#psave').onclick = async (e) => {
      e.target.disabled = true; const m = $('#pmsg');
      try { const out = await api({ action: 'profile', name: $('#pname').value, phone: $('#pphone').value }); st.profile = out.profile; m.textContent = 'Сохранено'; m.className = 'msg is-ok'; render(); }
      catch (err) { m.textContent = err.message; m.className = 'msg'; }
      e.target.disabled = false;
    };
    if ($('#tgon')) $('#tgon').onclick = async (e) => {
      e.target.disabled = true;
      try {
        const out = await api({ action: 'tglink' });
        window.open(out.url, '_blank', 'noopener');
        toast('Нажмите «Start» в Telegram — подключение займёт секунду');
        // ждём, пока человек нажмёт Start
        let tries = 0;
        const t = setInterval(async () => {
          tries++;
          try { const full = await api(null, true); if (full.telegram && full.telegram.linked) { clearInterval(t); apply(full); render(); toast('Telegram подключён ✓'); } } catch (err) { /* ждём */ }
          if (tries > 40) clearInterval(t);
        }, 3000);
      } catch (err) { toast(err.message, true); }
      e.target.disabled = false;
    };
    if ($('#tgoff')) $('#tgoff').onclick = async () => { await api({ action: 'tgunlink' }); st.telegram = { linked: false }; render(); toast('Telegram отключён'); };
    $('#pdel').onclick = async () => {
      const word = prompt('Это нельзя отменить. Чтобы удалить все данные, напишите слово УДАЛИТЬ');
      if (word === null) return;
      if (word.trim().toUpperCase() !== 'УДАЛИТЬ') return toast('Удаление отменено', true);
      try { await api({ action: 'deleteMe', confirm: 'УДАЛИТЬ' }); st.user = null; history.replaceState(null, '', location.pathname); render(); toast('Все ваши данные удалены'); }
      catch (err) { toast(err.message, true); }
    };
  }

  /* ---------- Живое обновление статусов ---------- */
  setInterval(async () => {
    if (document.hidden || !st.user || st.tab !== 'bookings' || $('.mybk__move.is-open')) return;
    const active = st.bookings.filter((b) => !b.cancelled);
    if (!active.length) return;
    try {
      const r = await (await fetch(`/api/account?ids=${active.map((b) => b.id).join(',')}`, { credentials: 'same-origin', cache: 'no-store' })).json();
      if (active.some((b) => r.statuses && r.statuses[b.id] !== b.status)) await reload();
    } catch (e) { /* сеть */ }
  }, 12000);

  /* ---------- Тема и старт ---------- */
  $('#themeToggle').onclick = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* ничего */ }
  };
  (async () => {
    const get = (p) => fetch(p, { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({}));
    const [site, posts, files] = await Promise.all([get('../content/site.json'), get('../content/posts.json'), get('../content/files.json')]);
    st.site = site || {}; st.posts = (posts && posts.posts) || []; st.files = (files && files.files) || [];
    if (st.site.name) $('#siteName').textContent = st.site.name;
    try { apply(await api(null, true)); } catch (e) { st.enabled = false; }
    render();
  })();
})();
