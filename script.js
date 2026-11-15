/* =====================================================================
   SCRIPT.JS — вся логика и анимации блога
   Контент берётся из папки content/ (JSON-файлы, которые редактирует админка /admin):
   site.json, posts.json, files.json, videos.json, links.json.

   Модули:
   1. Утилиты и настройки
   2. Рендер карточек
   3. Поиск и фильтр по тегам
   4. Модальное окно поста
   5. Ленивая загрузка видео
   6. Меню, подсветка раздела, бургер, тема
   7. Кнопка «наверх» с прогрессом
   8. Появление при скролле
   9. Прелоадер и печатная машинка
   10. Частицы в hero
   11. Кастомный курсор
   12. 3D-наклон карточек, магнитные кнопки, параллакс пятен
   ===================================================================== */
(() => {
  'use strict';

  /* ---------- 1. УТИЛИТЫ ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Экранирование текста, чтобы данные не ломали разметку
  const esc = (str = '') => String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const formatDate = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? esc(iso) : dateFmt.format(d);
  };
  // Новые записи — первыми
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');
  // Нормализация для поиска: регистр и «ё»
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е');

  const safe = (arr) => (Array.isArray(arr) ? arr : []);
  const DATA = { site: {}, posts: [], files: [], videos: [], links: [] };

  // Загрузка контента из content/*.json (no-cache — чтобы правки из админки появлялись сразу)
  async function loadContent() {
    const get = (name) => fetch(`content/${name}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    const [site, p, f, v, l] = await Promise.all(['site', 'posts', 'files', 'videos', 'links'].map(get));
    DATA.site = site || {};
    DATA.posts = safe(p.posts).slice().sort(byDateDesc);
    DATA.files = safe(f.files).slice().sort(byDateDesc);
    DATA.videos = safe(v.videos).slice().sort(byDateDesc);
    DATA.links = safe(l.links);
    return !!(p.posts || f.files);
  }

  // Разрешаем только безопасные адреса в ссылках и картинках из Markdown
  const safeUrl = (u) => (/^(https?:|mailto:|\/|\.|#)/i.test(u) || /^[\w.-]+(\/[\w.\-%]*)*$/.test(u) ? u : '#');

  // Мини-Markdown → HTML (заголовки, списки, цитаты, жирный, курсив, ссылки, картинки, код)
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, href) => `<a href="${safeUrl(href)}" target="_blank" rel="noopener noreferrer">${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

  function markdown(src = '') {
    const out = [];
    let list = null, para = [], quote = [];
    const flush = () => {
      if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; }
      if (quote.length) { out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = []; }
      if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; }
    };
    String(src).replace(/\r/g, '').split('\n').forEach((raw) => {
      const line = raw.trim();
      let m;
      if (!line) { flush(); return; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
        flush();
        const n = m[1].length >= 4 ? 4 : 3; // #, ## и ### → подзаголовок h3, #### → h4
        out.push(`<h${n}>${inline(m[2])}</h${n}>`);
        return;
      }
      if ((m = line.match(/^>\s?(.*)$/))) {
        if (para.length || list) flush();
        quote.push(m[1]);
        return;
      }
      if ((m = line.match(/^([-*+]|\d+[.)])\s+(.*)$/))) {
        const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (para.length || quote.length || (list && list.tag !== tag)) flush();
        list = list || { tag, items: [] };
        list.items.push(m[2]);
        return;
      }
      if (list || quote.length) flush();
      para.push(line);
    });
    flush();
    return out.join('\n');
  }

  // Тип файла по расширению (от него зависит иконка)
  const fileType = (f) => {
    if (['pdf', 'zip', 'image', 'doc'].includes(f.type)) return f.type;
    const ext = (f.file || '').split('?')[0].split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return 'zip';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'heic'].includes(ext)) return 'image';
    return 'doc';
  };
  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0).replace('.', ',')} КБ`;
    return `${(bytes / 1048576).toFixed(1).replace('.', ',')} МБ`;
  };
  // Размер файла сайт узнаёт сам (HEAD-запрос), вводить его в админке не нужно
  function fillFileSizes() {
    $$('[data-size-of]').forEach((el) => {
      if (el.textContent.trim()) return;
      fetch(el.dataset.sizeOf, { method: 'HEAD' })
        .then((r) => { const n = +r.headers.get('content-length'); if (r.ok && n) el.textContent = formatSize(n); })
        .catch(() => {});
    });
  }

  // ID видео из ссылки YouTube (watch?v=, youtu.be/, shorts/, embed/) или «голого» ID
  const youtubeId = (v) => {
    const s = String(v.youtube || v.youtubeId || '').trim();
    const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/);
    return m ? m[1] : s;
  };

  const SOCIAL_ICONS = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 3 11l6 2 2 6 3-4 5 4z"/><path d="m9 13 8-6"/></svg>',
    github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 2.8 5.8 3.1 5.8 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/></svg>',
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'
  };

  // Настройки сайта из content/site.json: имя, подпись, аватар, «Обо мне», соцсети
  function applySite(site) {
    if (site.name) {
      $$('[data-site="name"]').forEach((el) => { el.textContent = site.name; });
      const h1 = $('#typewriter');
      h1.dataset.text = site.name;
      h1.textContent = site.name;
      document.title = `${site.name} — личный блог`;
    }
    if (site.status) $('[data-site="status"]').textContent = site.status;
    if (site.avatar) {
      const img = $('[data-site="avatar"]');
      img.src = site.avatar;
      img.alt = `Фото: ${site.name || 'автор блога'}`;
    }
    if (site.about) $('[data-site="about"]').innerHTML = markdown(site.about);
    if (Array.isArray(site.socials) && site.socials.length) {
      $('[data-site="socials"]').innerHTML = site.socials.map((s) => `
        <li><a class="social magnetic" href="${esc(safeUrl(s.url || '#'))}" target="_blank" rel="noopener noreferrer">
          ${SOCIAL_ICONS[norm(s.name || '')] || SOCIAL_ICONS.link}<span>${esc(s.name)}</span></a></li>`).join('');
    }
  }

  // Маленькие SVG-иконки
  const ICONS = {
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    external: '<svg class="link-card__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M6 11l6 6 6-6M5 21h14"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-9.3-9.2C1.4 7.8 3.4 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3.1 1.6-1.9 3.1-3.1 5.2-3.1 3.4 0 5.4 3.3 4.1 6.6-1.8 4.6-9.3 9.2-9.3 9.2z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    zip: '<svg viewBox="0 0 24 24"><path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M1 3h22v5H1zM10 12h4"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 9h1M9 13h6M9 17h6"/></svg>'
  };
  const FILE_LABEL = { pdf: 'PDF', zip: 'ZIP', image: 'IMG', doc: 'DOC' };

  const tagsHTML = (tags = []) =>
    `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;

  // Общие data-атрибуты для поиска и фильтра
  const dataAttrs = (item, extra = '') => {
    const text = norm([item.title, item.description, item.excerpt, item.category, extra, ...(item.tags || [])].join(' '));
    const tags = (item.tags || []).map(norm).join('|');
    return `data-search="${esc(text)}" data-tags="${esc(tags)}"`;
  };

  // Постоянный id поста для лайков (поле id из админки; для старых постов — хеш даты и заголовка)
  const postId = (p) => {
    if (p.id) return String(p.id);
    let h = 0;
    for (const ch of `${p.date}|${p.title}`) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return `p-${h.toString(36)}`;
  };
  const likeButton = (p) => `<button class="like" type="button" data-like="${esc(postId(p))}" aria-pressed="false" aria-label="Нравится" hidden>${ICONS.heart}<span class="like__count"></span></button>`;

  /* ---------- 2. РЕНДЕР КАРТОЧЕК ---------- */
  function renderPosts() {
    $('#postsGrid').innerHTML = DATA.posts.map((p, i) => `
      <article class="card post-card tilt reveal" ${dataAttrs(p, p.body || '')}>
        <button class="post-card__btn" type="button" data-post="${i}" aria-label="Читать пост: ${esc(p.title)}"></button>
        <div class="card__media">
          <img src="${esc(p.cover)}" alt="${esc(p.alt || p.title)}" loading="lazy" decoding="async" width="900" height="560">
        </div>
        <div class="card__body">
          <div class="meta"><time datetime="${esc(p.date)}">${formatDate(p.date)}</time></div>
          <h3 class="card__title">${esc(p.title)}</h3>
          <p class="card__text">${esc(p.excerpt)}</p>
          ${tagsHTML(p.tags)}
          <div class="post-card__foot">
            <span class="read-more">Читать ${ICONS.arrow}</span>
            ${likeButton(p)}
          </div>
        </div>
      </article>`).join('');
  }

  function renderFiles() {
    $('#filesGrid').innerHTML = DATA.files.map((f) => {
      const type = fileType(f);
      const fileName = (f.file || '').split('/').pop();
      return `
      <article class="card file-card tilt reveal" ${dataAttrs(f, fileName)}>
        <div class="card__body">
          <div class="file-card__head">
            <span class="file-icon file-icon--${type}" title="${FILE_LABEL[type]}">${ICONS[type]}</span>
            <div>
              <h3 class="card__title">${esc(f.title)}</h3>
              <div class="meta"><span>${FILE_LABEL[type]}</span><span data-size-of="${esc(f.file)}">${esc(f.size || '')}</span><time datetime="${esc(f.date)}">${formatDate(f.date)}</time></div>
            </div>
          </div>
          <p class="card__text">${esc(f.description)}</p>
          ${tagsHTML(f.tags)}
          <div class="file-card__foot">
            <a class="btn btn--primary btn--sm magnetic" href="${esc(f.file)}" download="${esc(fileName)}">${ICONS.download}<span>Скачать</span></a>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  function renderVideos() {
    $('#videosGrid').innerHTML = DATA.videos.map((v) => ({ ...v, youtubeId: youtubeId(v) })).map((v) => `
      <article class="card video-card tilt reveal" ${dataAttrs(v)}>
        <div class="video-card__player">
          <button class="video-card__poster" type="button" data-video="${esc(v.youtubeId)}" data-title="${esc(v.title)}" aria-label="Смотреть видео: ${esc(v.title)}">
            <img src="https://i.ytimg.com/vi/${esc(v.youtubeId)}/hqdefault.jpg" alt="Превью видео «${esc(v.title)}»" loading="lazy" decoding="async" width="480" height="360">
            <span class="play">${ICONS.play}</span>
          </button>
        </div>
        <div class="card__body">
          <div class="meta"><time datetime="${esc(v.date)}">${formatDate(v.date)}</time></div>
          <h3 class="card__title">${esc(v.title)}</h3>
          <p class="card__text">${esc(v.description)}</p>
          ${tagsHTML(v.tags)}
        </div>
      </article>`).join('');
  }

  function renderLinks() {
    $('#linksGrid').innerHTML = DATA.links.map((l) => {
      let host = l.url;
      try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch (e) { /* оставляем как есть */ }
      return `
      <article class="card link-card tilt reveal" ${dataAttrs(l, host)}>
        ${ICONS.external}
        <div class="card__body">
          <div class="link-card__head">
            <img class="favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64" alt="" loading="lazy" width="44" height="44">
            <div>
              <span class="link-card__cat">${esc(l.category)}</span>
              <h3 class="card__title"><a class="link-card__stretch" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title)}</a></h3>
            </div>
          </div>
          <p class="card__text">${esc(l.description)}</p>
          ${tagsHTML(l.tags)}
          <span class="link-card__url">${esc(host)}</span>
        </div>
      </article>`;
    }).join('');
  }

  // Если картинка не загрузилась — показываем неоновый градиент вместо «битой» иконки
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG') return;
    const box = img.closest('.card__media, .video-card__poster');
    if (box) box.classList.add('img-fallback');
    else if (img.classList.contains('favicon')) img.style.visibility = 'hidden';
  }, true);

  /* ---------- 3. ПОИСК И ФИЛЬТР ---------- */
  const state = { query: '', tag: '' };
  const sections = [
    { grid: '#postsGrid', name: 'постов' },
    { grid: '#filesGrid', name: 'файлов' },
    { grid: '#videosGrid', name: 'видео' },
    { grid: '#linksGrid', name: 'ссылок' }
  ];

  function renderChips() {
    // Собираем все теги со всего сайта и считаем частоту
    const counts = new Map();
    [...DATA.posts, ...DATA.files, ...DATA.videos, ...DATA.links].forEach((item) =>
      (item.tags || []).forEach((t) => counts.set(norm(t), (counts.get(norm(t)) || 0) + 1)));
    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'));

    $('#tagChips').innerHTML =
      `<button class="chip is-active" type="button" data-tag="" aria-pressed="true">Все</button>` +
      tags.map(([t, n]) => `<button class="chip" type="button" data-tag="${esc(t)}" aria-pressed="false">${esc(t)} <small>${n}</small></button>`).join('');

    $('#tagChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      // повторный клик по активному тегу снимает фильтр
      state.tag = state.tag === chip.dataset.tag ? '' : chip.dataset.tag;
      $$('.chip').forEach((c) => {
        const on = c.dataset.tag === state.tag;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', on);
      });
      applyFilters();
    });
  }

  function applyFilters() {
    const words = norm(state.query).trim().split(/\s+/).filter(Boolean);
    let total = 0;
    const summary = [];

    sections.forEach(({ grid, name }) => {
      const el = $(grid);
      let visible = 0;
      $$('.card', el).forEach((card) => {
        const okText = words.every((w) => card.dataset.search.includes(w));
        const okTag = !state.tag || card.dataset.tags.split('|').includes(state.tag);
        const show = okText && okTag;
        card.classList.toggle('is-filtered', !show);
        if (show) visible++;
      });
      el.nextElementSibling.hidden = visible > 0;
      total += visible;
      summary.push(`${name}: ${visible}`);
    });

    const active = words.length || state.tag;
    $('#searchStatus').textContent = active
      ? (total ? `Найдено ${total} — ${summary.join(', ')}` : 'Ничего не найдено. Попробуйте другой запрос или тег.')
      : '';
  }

  function initSearch() {
    const input = $('#searchInput');
    input.addEventListener('input', () => { state.query = input.value; applyFilters(); });
    // «/» — быстрый фокус на поиск, Esc — очистка
    document.addEventListener('keydown', (e) => {
      const typing = /input|textarea/i.test(document.activeElement.tagName);
      if (e.key === '/' && !typing && $('#postModal').hidden) {
        e.preventDefault();
        input.focus({ preventScroll: true });
        $('#search').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
      if (e.key === 'Escape' && document.activeElement === input) {
        input.value = ''; state.query = ''; applyFilters(); input.blur();
      }
    });
  }

  /* ---------- 4. МОДАЛЬНОЕ ОКНО ПОСТА ---------- */
  const modal = $('#postModal');
  const dialog = $('.modal__dialog', modal);
  let lastFocus = null;
  let closeTimer = null;

  function openPost(index, originEl) {
    const p = DATA.posts[index];
    if (!p) return;
    clearTimeout(closeTimer);
    lastFocus = document.activeElement;

    const cover = $('#modalCover');
    cover.src = p.cover; cover.alt = p.alt || p.title;
    $('#modalTitle').textContent = p.title;
    $('#modalMeta').innerHTML = `<time datetime="${esc(p.date)}">${formatDate(p.date)}</time>` + tagsHTML(p.tags).replace('class="tags"', 'class="tags" style="margin:0;padding:0"') + likeButton(p);
    likes.paint();
    $('#modalContent').innerHTML = markdown(p.body || p.excerpt || '');

    // Блокируем прокрутку страницы, компенсируя ширину скроллбара
    const sbw = innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = sbw ? sbw + 'px' : '';
    document.body.classList.add('is-locked');

    modal.hidden = false;
    dialog.scrollTop = 0;

    // Окно «вырастает» из карточки, по которой кликнули
    if (originEl) {
      const r = originEl.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      dialog.style.setProperty('--ox', `${r.left + r.width / 2 - d.left}px`);
      dialog.style.setProperty('--oy', `${r.top + r.height / 2 - d.top}px`);
    }
    void dialog.offsetWidth; // перерисовка перед анимацией
    modal.classList.add('is-open');
    $('.modal__close', modal).focus({ preventScroll: true });
  }

  function closePost() {
    if (modal.hidden) return;
    modal.classList.remove('is-open');
    closeTimer = setTimeout(() => {
      modal.hidden = true;
      document.body.classList.remove('is-locked');
      document.body.style.paddingRight = '';
      lastFocus?.focus({ preventScroll: true });
    }, reducedMotion ? 0 : 450);
  }

  function initModal() {
    $('#postsGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-post]');
      if (btn) openPost(+btn.dataset.post, btn.closest('.card'));
    });
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closePost(); });
    document.addEventListener('keydown', (e) => {
      if (modal.hidden) return;
      if (e.key === 'Escape') closePost();
      // Удерживаем фокус внутри окна
      if (e.key === 'Tab') {
        const items = $$('a[href], button, [tabindex]:not([tabindex="-1"])', dialog);
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- 5. ЛЕНИВАЯ ЗАГРУЗКА ВИДЕО ---------- */
  function initVideos() {
    $('#videosGrid').addEventListener('click', (e) => {
      const poster = e.target.closest('[data-video]');
      if (!poster) return;
      // iframe создаётся только по клику — страница остаётся лёгкой
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(poster.dataset.video)}?autoplay=1&rel=0`;
      iframe.title = poster.dataset.title;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      poster.replaceWith(iframe);
      iframe.focus();
    });
  }

  /* ---------- 6. МЕНЮ, ПОДСВЕТКА РАЗДЕЛА, БУРГЕР, ТЕМА ---------- */
  function initNav() {
    const header = $('#header');
    const nav = $('#nav');
    const burger = $('#burger');
    const links = $$('.nav__link');

    const setMenu = (open) => {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open);
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    };
    burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
    links.forEach((a) => a.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !e.target.closest('#nav, #burger')) setMenu(false);
    });

    // Фон шапки после начала прокрутки
    const onScroll = () => header.classList.toggle('is-scrolled', scrollY > 20);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Подсветка текущего раздела
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
        const link = map.get(entry.target.id);
        if (link) { link.classList.add('is-active'); link.setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section[id]').forEach((s) => spy.observe(s));
  }

  function initTheme() {
    const root = document.documentElement;
    const meta = $('meta[name="theme-color"]');
    const apply = (theme) => {
      root.dataset.theme = theme;
      meta.content = theme === 'light' ? '#f4f2fb' : '#0a0a12';
      document.dispatchEvent(new CustomEvent('themechange'));
    };
    apply(root.dataset.theme || 'dark');
    $('#themeToggle').addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      apply(next);
      try { localStorage.setItem('theme', next); } catch (e) { /* приватный режим */ }
    });
  }

  /* ---------- 7. КНОПКА «НАВЕРХ» ---------- */
  function initToTop() {
    const btn = $('#toTop');
    const bar = $('#toTopBar');
    const length = 2 * Math.PI * 21;
    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const progress = max > 0 ? Math.min(scrollY / max, 1) : 0;
      bar.style.strokeDashoffset = length * (1 - progress);
      btn.classList.toggle('is-visible', scrollY > innerHeight * 0.6);
      ticking = false;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    update();
    btn.addEventListener('click', () => scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' }));
  }

  /* ---------- 8. ПОЯВЛЕНИЕ ПРИ СКРОЛЛЕ ---------- */
  function initReveal() {
    const items = $$('.reveal');
    if (reducedMotion || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      // Элементы, появившиеся одновременно, получают каскадную задержку
      entries.filter((e) => e.isIntersecting).forEach((entry, i) => {
        const el = entry.target;
        el.style.setProperty('--d', `${Math.min(i, 6) * 90}ms`);
        el.classList.add('is-visible');
        io.unobserve(el);
        // убираем задержку после появления, чтобы hover не «тормозил»
        setTimeout(() => el.style.removeProperty('--d'), 1200 + i * 90);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el) => io.observe(el));
  }

  /* ---------- 9. ПРЕЛОАДЕР И ПЕЧАТНАЯ МАШИНКА ---------- */
  function typewriter() {
    const el = $('#typewriter');
    const text = el.dataset.text || el.textContent;
    el.setAttribute('aria-label', text);
    if (reducedMotion) { el.textContent = text; return; }
    el.textContent = '';
    el.classList.add('is-typing');
    let i = 0;
    const tick = () => {
      el.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(tick, 70 + Math.random() * 90);
      else { el.classList.remove('is-typing'); el.classList.add('is-typed'); }
    };
    setTimeout(tick, 350);
  }

  function initPreloader() {
    const pre = $('#preloader');
    const start = performance.now();
    let done = false;
    const hide = () => {
      if (done) return;
      done = true;
      const wait = Math.max(0, 700 - (performance.now() - start)); // логотип успеет «вспыхнуть»
      setTimeout(() => {
        pre.classList.add('is-hidden');
        typewriter();
        setTimeout(() => pre.remove(), 700);
      }, reducedMotion ? 0 : wait);
    };
    if (document.readyState === 'complete') hide();
    else addEventListener('load', hide);
    setTimeout(hide, 3000); // страховка, если что-то грузится слишком долго
  }

  /* ---------- 10. ЧАСТИЦЫ В HERO ---------- */
  function initParticles() {
    const canvas = $('#particles');
    const ctx = canvas.getContext('2d');
    const hero = $('#hero');
    let w = 0, h = 0, dpr = 1, particles = [], running = false, raf = 0;
    const mouse = { x: -9999, y: -9999 };
    let color = '168, 85, 247', lineColor = '34, 211, 238';

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      color = cs.getPropertyValue('--particle').trim() || color;
      lineColor = cs.getPropertyValue('--particle-line').trim() || lineColor;
    };

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      w = rect.width; h = rect.height;
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(70, Math.floor((w * h) / 20000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.1 + 0.5
      }));
      if (!running) draw(); // статичный кадр
    };

    const LINK = 140, MOUSE_R = 180;

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (running) {
          // Отталкивание от курсора
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < MOUSE_R && dist > 0) {
            const f = (1 - dist / MOUSE_R) * 0.35;
            p.x += (dx / dist) * f; p.y += (dy / dist) * f;
          }
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
        }
        // Линии между близкими частицами
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(${color}, ${(1 - d / LINK) * 0.12})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
        // Линии к курсору
        const md = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        if (md < MOUSE_R) {
          ctx.strokeStyle = `rgba(${lineColor}, ${(1 - md / MOUSE_R) * 0.35})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
        ctx.fillStyle = `rgba(${color}, 0.45)`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    const loop = () => { draw(); if (running) raf = requestAnimationFrame(loop); };
    const start = () => { if (!running && !reducedMotion) { running = true; raf = requestAnimationFrame(loop); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    hero.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });

    // Анимация идёт, только когда hero виден и вкладка активна
    let heroVisible = true;
    new IntersectionObserver(([e]) => {
      heroVisible = e.isIntersecting;
      heroVisible && !document.hidden ? start() : stop();
    }).observe(hero);
    document.addEventListener('visibilitychange', () => (document.hidden || !heroVisible ? stop() : start()));

    let resizeTimer;
    addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
    document.addEventListener('themechange', () => { readColors(); if (!running) draw(); });

    readColors();
    resize();
    start();
  }

  /* ---------- 11. КАСТОМНЫЙ КУРСОР ---------- */
  function initCursor() {
    if (!finePointer || reducedMotion) return; // на сенсорных экранах отключён
    const root = $('#cursor');
    document.documentElement.classList.add('has-cursor');

    const dot = document.createElement('div');
    dot.className = 'cursor__dot';
    const ring = document.createElement('div');   // кольцо-«хвост», плавно догоняет точку
    ring.className = 'cursor__ring';
    root.append(ring, dot);
    let rx = -100, ry = -100;

    let mx = -100, my = -100;
    addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      root.style.opacity = 1;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { root.style.opacity = 0; });

    // Увеличение над кликабельными элементами
    const CLICKABLE = 'a, button, input, label, [data-hover], .post-card';
    document.addEventListener('pointerover', (e) => root.classList.toggle('is-hover', !!e.target.closest(CLICKABLE)));

    const loop = () => {
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------- 12. НАКЛОН, МАГНИТЫ, ПАРАЛЛАКС ---------- */
  function initTilt() {
    if (!finePointer || reducedMotion) return;
    const MAX = 3; // максимальный угол наклона в градусах
    $$('.tilt').forEach((el) => {
      let raf = 0;
      el.addEventListener('pointermove', (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top) / r.height;
          el.classList.add('is-tilting');
          el.style.setProperty('--ry', `${(x - 0.5) * MAX * 2}deg`);
          el.style.setProperty('--rx', `${(0.5 - y) * MAX * 2}deg`);
          el.style.setProperty('--mx', `${x * 100}%`);
          el.style.setProperty('--my', `${y * 100}%`);
        });
      });
      el.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        el.classList.remove('is-tilting');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  }

  function initMagnetic() {
    if (!finePointer || reducedMotion) return;
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * 0.15}px, ${dy * 0.25}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  function initParallax() {
    if (reducedMotion) return;
    const layers = $$('.blobs__layer').map((el) => ({ el, depth: parseFloat(el.dataset.depth) || 0.2 }));
    let tx = 0, ty = 0, cx = 0, cy = 0, ticking = false;
    const render = () => {
      // плавно догоняем положение мыши
      cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
      layers.forEach(({ el, depth }) => {
        el.style.transform = `translate3d(${cx * depth * 60}px, ${-scrollY * depth * 0.4 + cy * depth * 60}px, 0)`;
      });
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) requestAnimationFrame(render);
      else ticking = false;
    };
    const kick = () => { if (!ticking) { ticking = true; requestAnimationFrame(render); } };
    addEventListener('scroll', kick, { passive: true });
    if (finePointer) {
      addEventListener('pointermove', (e) => {
        tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5;
        kick();
      }, { passive: true });
    }
    kick();
  }

  /* ---------- 14. ЛАЙКИ ПОСТОВ ---------- */
  // Счётчики хранятся на сервере (/api/likes); на GitHub Pages и без базы кнопки скрыты
  const likes = (() => {
    const state = { enabled: false, counts: {}, liked: {} };
    const LS = 'likedPosts';
    try { Object.assign(state.liked, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { /* ничего */ }
    const save = () => { try { localStorage.setItem(LS, JSON.stringify(state.liked)); } catch (e) { /* ничего */ } };
    const short = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')}k` : n ? String(n) : '');

    // Обновить все кнопки (на карточке и в открытом посте)
    function paint(id) {
      $$(id ? `[data-like="${CSS.escape(id)}"]` : '[data-like]').forEach((btn) => {
        const k = btn.dataset.like;
        btn.hidden = !state.enabled;
        const on = !!state.liked[k];
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', on);
        btn.setAttribute('aria-label', on ? 'Убрать лайк' : 'Нравится');
        btn.querySelector('.like__count').textContent = short(state.counts[k] || 0);
      });
    }

    async function load() {
      const ids = [...new Set($$('[data-like]').map((b) => b.dataset.like))];
      if (!ids.length) return;
      try {
        const r = await fetch(`/api/likes?ids=${ids.map(encodeURIComponent).join(',')}`, { cache: 'no-store' });
        if (!r.ok) return;
        const out = await r.json();
        if (!out.enabled) return;
        state.enabled = true;
        Object.assign(state.counts, out.counts);
        // сервер — главный источник: что он не знает как «ваш лайк», снимаем
        ids.forEach((id) => { if (out.liked[id]) state.liked[id] = true; else delete state.liked[id]; });
        save();
        paint();
      } catch (e) { /* нет сервера — лайки не показываем */ }
    }

    // Нажатие: сразу меняем вид, потом сверяемся с сервером
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-like]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.like;
      const like = !state.liked[id];
      if (like) state.liked[id] = true; else delete state.liked[id];
      state.counts[id] = Math.max(0, (state.counts[id] || 0) + (like ? 1 : -1));
      save();
      paint(id);
      if (like && !reducedMotion) {
        $$(`[data-like="${CSS.escape(id)}"]`).forEach((b) => { b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop'); });
      }
      try {
        const r = await fetch('/api/likes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, like }) });
        const out = await r.json();
        if (r.ok && out.ok) { state.counts[id] = out.count; paint(id); }
      } catch (err) { /* оставляем как есть */ }
    }, true);

    return { load, paint };
  })();

  /* ---------- 13. ЗАПИСЬ: АНКЕТА → TELEGRAM ---------- */
  // Услуги и время берутся из content/site.json (редактируются в админке)
  const DEFAULT_SERVICES = ['Создание сайта', 'Монтаж видео', 'Дизайн', 'Консультация', 'Другое'];
  const DEFAULT_SLOTS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

  // Откуда пришёл посетитель: utm_source из ссылки или сайт-источник (для статистики заявок)
  function visitSource() {
    try {
      const saved = sessionStorage.getItem('visitSource');
      if (saved !== null) return saved;
    } catch (e) { /* приватный режим */ }
    let src = new URLSearchParams(location.search).get('utm_source') || '';
    if (!src && document.referrer) {
      try {
        const host = new URL(document.referrer).hostname.replace(/^www\./, '');
        if (host && host !== location.hostname) src = host;
      } catch (e) { /* некорректный referrer */ }
    }
    try { sessionStorage.setItem('visitSource', src); } catch (e) { /* ничего */ }
    return src;
  }
  visitSource(); // запоминаем источник сразу при заходе

  // Коды стран для поля телефона: [код ISO, название, код страны, пример номера]
  const COUNTRIES = [
    ['PL', 'Польша', '+48', '512 345 678'],
    ['UA', 'Украина', '+380', '50 123 4567'],
    ['AT', 'Австрия', '+43', '664 123456'],
    ['AM', 'Армения', '+374', '77 123456'],
    ['BY', 'Беларусь', '+375', '29 123 45 67'],
    ['GB', 'Великобритания', '+44', '7400 123456'],
    ['DE', 'Германия', '+49', '1512 3456789'],
    ['GE', 'Грузия', '+995', '555 12 34 56'],
    ['IE', 'Ирландия', '+353', '85 012 3456'],
    ['ES', 'Испания', '+34', '612 34 56 78'],
    ['IT', 'Италия', '+39', '312 345 6789'],
    ['KZ', 'Казахстан', '+7', '701 123 4567'],
    ['LV', 'Латвия', '+371', '21 234 567'],
    ['LT', 'Литва', '+370', '612 34567'],
    ['MD', 'Молдова', '+373', '621 12 345'],
    ['NL', 'Нидерланды', '+31', '6 12345678'],
    ['NO', 'Норвегия', '+47', '406 12 345'],
    ['PT', 'Португалия', '+351', '912 345 678'],
    ['RU', 'Россия', '+7', '900 123-45-67'],
    ['SK', 'Словакия', '+421', '912 123 456'],
    ['US', 'США / Канада', '+1', '201 555 0123'],
    ['TR', 'Турция', '+90', '501 234 56 78'],
    ['FR', 'Франция', '+33', '6 12 34 56 78'],
    ['CZ', 'Чехия', '+420', '601 123 456'],
    ['SE', 'Швеция', '+46', '70 123 45 67'],
    ['EE', 'Эстония', '+372', '5123 4567']
  ];
  // Флаг из кода страны (две «буквы-флага» Unicode)
  const flag = (cc) => cc.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));

  function initPhone() {
    const select = $('#phoneCountry');
    const input = $('#bookingPhone');
    const code = $('#phoneCode');
    if (!select || !input) return () => input && input.value;

    select.innerHTML = COUNTRIES.map(([cc, name, dial]) => `<option value="${cc}">${flag(cc)} ${esc(name)} ${dial}</option>`).join('');
    const byCode = (cc) => COUNTRIES.find((c) => c[0] === cc) || COUNTRIES[0];
    const setCountry = (cc) => {
      const [c, , dial, example] = byCode(cc);
      select.value = c;
      code.textContent = `${flag(c)} ${dial}`;
      input.placeholder = example;
    };

    // По умолчанию Польша; если язык браузера указывает на другую страну из списка — она
    const region = (navigator.languages || [navigator.language || ''])
      .map((l) => (l.split('-')[1] || '').toUpperCase()).find((r) => COUNTRIES.some((c) => c[0] === r));
    setCountry(region || 'PL');
    select.addEventListener('change', () => { setCountry(select.value); input.focus(); });

    // Вставили или набрали номер с «+» или «00» — определяем страну и убираем код из поля
    input.addEventListener('input', () => {
      const raw = input.value.trim().replace(/^00/, '+');
      if (!raw.startsWith('+')) return;
      const digits = raw.replace(/[^\d]/g, '');
      let match = null;
      for (const c of COUNTRIES) {
        const d = c[2].slice(1);
        if (digits.startsWith(d) && (!match || d.length > match[2].length - 1)) match = c;
      }
      if (!match) return;
      // +7: 6 и 7 после кода — Казахстан, иначе Россия
      if (match[2] === '+7') match = byCode(/^7[67]/.test(digits) ? 'KZ' : 'RU');
      if (digits.length <= match[2].length - 1) return; // ждём, пока наберут дальше кода
      setCountry(match[0]);
      const rest = raw.slice(raw.indexOf(match[2].slice(1)) + match[2].length - 1).replace(/^[\s-]+/, '');
      input.value = rest;
    });

    // Полный номер для заявки: «+48 512 345 678»
    return () => {
      const national = input.value.trim();
      return national ? `${byCode(select.value)[2]} ${national}` : '';
    };
  }

  function initBooking(site) {
    const form = $('#bookingForm');
    if (!form) return;
    const services = safe(site.services).filter(Boolean).length ? safe(site.services).filter(Boolean) : DEFAULT_SERVICES;
    const slots = safe(site.slots).filter(Boolean).length ? safe(site.slots).filter(Boolean) : DEFAULT_SLOTS;
    const dateInput = $('#bookingDate');
    const timeSelect = $('#bookingTime');
    const status = $('#bookingStatus');
    const submit = $('#bookingSubmit');
    const startedAt = Date.now();
    const fullPhone = initPhone();

    // Услуги — радиокнопки-«таблетки»
    $('#serviceOptions').innerHTML = services.map((s, i) => `
      <label><input type="radio" name="service" value="${esc(s)}" ${i === 0 ? 'required' : ''}><span>${esc(s)}</span></label>`).join('');

    // Дата: с сегодняшнего дня и на 60 дней вперёд (по местному времени посетителя)
    const pad = (n) => String(n).padStart(2, '0');
    const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = new Date();
    const max = new Date(); max.setDate(max.getDate() + 60);
    dateInput.min = isoLocal(today);
    dateInput.max = isoLocal(max);

    // Время: прошедшие (на сегодня) и уже занятые слоты недоступны
    let taken = [];
    let closedLabel = null; // «Выходной» / «Отпуск» / «Занято», если день закрыт через бота
    const fillSlots = () => {
      const isToday = dateInput.value === isoLocal(new Date());
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes() + 30; // минимум за 30 минут
      const prev = timeSelect.value;
      let free = 0;
      const dayClosed = !!closedLabel || taken.includes('*'); // день закрыт целиком (через бота)
      timeSelect.innerHTML = '<option value="">Выберите время</option>' + slots.map((t) => {
        const [h, m] = t.split(':').map(Number);
        const past = isToday && h * 60 + (m || 0) < nowMin;
        const busy = dayClosed || taken.includes(t);
        if (!past && !busy) free++;
        const note = past ? ' — прошло' : dayClosed ? '' : busy ? ' — занято' : '';
        return `<option value="${esc(t)}" ${past || busy ? 'disabled' : ''}>${esc(t)}${note}</option>`;
      }).join('');
      if (dateInput.value && !free) timeSelect.options[0].textContent = dayClosed ? `${closedLabel || 'Занято'} — записи нет` : 'На эту дату всё занято';
      showDayNote(dayClosed ? `${closedLabel || 'Занято'}: в этот день записи нет, выберите другую дату.` : '');
      if (prev && !timeSelect.querySelector(`option[value="${CSS.escape(prev)}"]:not([disabled])`)) timeSelect.value = '';
      else timeSelect.value = prev;
    };
    // Узнаём у сервера, какое время на выбранную дату уже занято
    let slotsReq = 0;
    const loadTaken = async () => {
      taken = [];
      closedLabel = null;
      fillSlots();
      if (!dateInput.value) return;
      const req = ++slotsReq;
      timeSelect.disabled = true;
      try {
        const r = await fetch(`/api/slots?date=${encodeURIComponent(dateInput.value)}`, { cache: 'no-store' });
        const out = r.ok ? await r.json() : {};
        if (req === slotsReq) { taken = safe(out.taken); closedLabel = out.closed || null; }
      } catch (e) { /* без сервера (например, на GitHub Pages) просто не знаем о занятых */ }
      if (req === slotsReq) { timeSelect.disabled = false; fillSlots(); }
    };
    // Подсказка под датой, если день закрыт
    function showDayNote(text) {
      const box = dateInput.closest('.field');
      let note = box.querySelector('.field__note');
      if (!text) { if (note) note.remove(); return; }
      if (!note) { note = document.createElement('span'); note.className = 'field__note'; box.appendChild(note); }
      note.textContent = text;
    }
    fillSlots();
    dateInput.addEventListener('change', loadTaken);

    // Проверка полей с понятными сообщениями
    const setError = (el, msg) => {
      const box = el.closest('.field, .form__group');
      box.classList.toggle('is-invalid', !!msg);
      let err = box.querySelector('.field__error');
      if (msg) {
        if (!err) { err = document.createElement('span'); err.className = 'field__error'; box.appendChild(err); }
        err.textContent = msg;
      } else if (err) err.remove();
    };
    const validate = () => {
      const data = Object.fromEntries(new FormData(form));
      const errors = [];
      const check = (el, msg) => { setError(el, msg); if (msg) errors.push(el); };
      check($('#serviceOptions'), data.service ? '' : 'Выберите услугу');
      check(dateInput, !data.date ? 'Выберите дату' : (data.date < dateInput.min || data.date > dateInput.max) ? 'Эта дата недоступна' : '');
      check(timeSelect, data.time ? '' : 'Выберите время');
      check(form.elements.name, data.name.trim().length >= 2 ? '' : 'Напишите имя');
      const phoneDigits = data.phone.replace(/\D/g, '').length;
      check(form.elements.phone, !phoneDigits ? 'Напишите номер телефона' : (phoneDigits < 6 || phoneDigits > 12) ? 'Проверьте номер телефона' : '');
      check(form.elements.email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim()) ? '' : 'Проверьте почту');
      return { data, errors };
    };
    // Ошибку у поля убираем, как только его исправили
    form.addEventListener('input', (e) => {
      const box = e.target.closest('.field, .form__group');
      if (box && box.classList.contains('is-invalid')) validate();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form__status';
      const { data, errors } = validate();
      if (errors.length) {
        status.textContent = 'Проверьте отмеченные поля.';
        status.classList.add('is-error');
        (errors[0].querySelector?.('input') || errors[0]).focus();
        return;
      }
      submit.disabled = true;
      status.textContent = 'Отправляю…';
      try {
        const res = await fetch('/api/booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...data, phone: fullPhone(), ref: visitSource(), elapsed: Date.now() - startedAt })
        });
        const out = await res.json().catch(() => ({}));
        if (out.taken) {
          // Кто-то успел занять это время — обновляем список и просим выбрать другое
          await loadTaken();
          setError(timeSelect, 'Это время уже заняли');
          status.textContent = 'Это время только что заняли. Выберите другое.';
          status.classList.add('is-error');
          submit.disabled = false;
          timeSelect.focus();
          return;
        }
        if (!res.ok || !out.ok) throw new Error(out.error || 'Не получилось отправить заявку.');
        const when = `${formatDate(data.date)}, ${data.time}`;
        form.innerHTML = `
          <div class="form-done">
            <span class="form-done__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17 19 7"/></svg></span>
            <h3>Заявка отправлена</h3>
            <p>${esc(data.service)} · ${esc(when)}. Я свяжусь с вами по телефону или почте, чтобы подтвердить время.</p>
            ${out.manageUrl ? `<p>Подтверждение отправлено на почту. Если планы поменяются, запись можно <a href="${esc(out.manageUrl)}">перенести или отменить</a>.</p>` : ''}
          </div>`;
        form.closest('.booking').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
        account.refresh();
      } catch (err) {
        status.textContent = `${err.message} Можно написать мне в Instagram.`;
        status.classList.add('is-error');
        submit.disabled = false;
      }
    });
  }

  /* ---------- 15. ЛИЧНЫЙ КАБИНЕТ (вход через Google) ---------- */
  // Клиент видит свои будущие записи (по почте Google), переносит и отменяет их.
  // Кнопка в шапке появляется, только если в Vercel задан GOOGLE_CLIENT_ID.
  const account = (() => {
    const st = { enabled: false, clientId: null, user: null, bookings: [] };
    const modalEl = $('#accountModal');
    const body = $('#accountBody');
    const btn = $('#accountBtn');
    if (!modalEl || !btn) return { init() {}, refresh() {} };
    let slotsCfg = DEFAULT_SLOTS;

    const api = async (data) => {
      const r = await fetch('/api/account', {
        method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: data ? { 'Content-Type': 'application/json' } : undefined,
        body: data ? JSON.stringify(data) : undefined
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out.ok) throw Object.assign(new Error(out.error || 'Ошибка сети. Попробуйте ещё раз.'), out);
      return out;
    };

    // Кнопка в шапке: иконка или аватар
    function paintButton() {
      btn.hidden = !st.enabled;
      const img = $('#accountAvatar');
      const has = !!(st.user && st.user.picture);
      img.hidden = !has;
      if (has) img.src = st.user.picture;
      btn.classList.toggle('is-in', !!st.user);
      btn.setAttribute('aria-label', st.user ? `Личный кабинет: ${st.user.name || st.user.email}` : 'Войти в личный кабинет');
    }

    // Подставить имя и почту в анкету записи (если поля пустые)
    function autofill() {
      const form = $('#bookingForm');
      if (!st.user || !form || !form.elements.email) return;
      if (!form.elements.name.value && st.user.name) form.elements.name.value = st.user.name;
      if (!form.elements.email.value) form.elements.email.value = st.user.email;
    }

    // Подгружаем скрипт Google только когда нужен
    let gsiPromise = null;
    const loadGsi = () => gsiPromise || (gsiPromise = new Promise((resolve, reject) => {
      if (window.google && google.accounts && google.accounts.id) return resolve();
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client';
      sc.async = true;
      sc.onload = resolve;
      sc.onerror = () => { gsiPromise = null; reject(new Error('Не удалось загрузить вход Google.')); };
      document.head.appendChild(sc);
    }));

    async function onCredential(resp) {
      say('Вхожу…');
      try {
        const out = await api({ action: 'login', credential: resp.credential });
        st.user = out.user; st.bookings = out.bookings || [];
        paintButton(); autofill(); render();
      } catch (e) { say(e.message, 'is-error'); }
    }

    const say = (text, cls = '') => { const m = $('#accountMsg'); if (m) { m.textContent = text; m.className = `account__msg ${cls}`; } };
    const human = (iso) => {
      const d = new Date(iso + 'T00:00:00');
      return isNaN(d) ? iso : new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }).format(d);
    };

    function render() {
      if (!st.user) {
        body.innerHTML = `
          <h2 class="account__title" id="accountTitle">Личный кабинет</h2>
          <p class="account__lead">Войдите через Google, чтобы видеть свои записи, переносить и отменять их в пару кликов.</p>
          <div class="account__gsi" id="gsiButton"></div>
          <p class="account__msg" id="accountMsg"></p>
          <p class="account__fine">Сайт получит только ваше имя, почту и фото профиля — без доступа к письмам и файлам.</p>`;
        loadGsi().then(() => {
          google.accounts.id.initialize({ client_id: st.clientId, callback: onCredential, ux_mode: 'popup', auto_select: false });
          const dark = document.documentElement.dataset.theme !== 'light';
          google.accounts.id.renderButton($('#gsiButton'), { theme: dark ? 'filled_black' : 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ru' });
        }).catch((e) => say(e.message, 'is-error'));
        return;
      }

      const u = st.user;
      const items = st.bookings.map((b) => `
        <article class="mybk__item" data-id="${esc(b.id)}">
          <div class="mybk__when">${esc(human(b.date))}, ${esc(b.time)}</div>
          <div class="mybk__meta">${b.service ? `<span>${esc(b.service)}</span>` : ''}
            <span class="mybk__status ${b.status === 'confirmed' ? 'is-ok' : 'is-new'}">${b.status === 'confirmed' ? 'подтверждено' : 'ждёт подтверждения'}</span></div>
          <div class="mybk__actions">
            <button class="btn btn--ghost btn--sm" data-act="move">Перенести</button>
            <button class="btn btn--ghost btn--sm btn--danger" data-act="cancel">Отменить</button>
          </div>
          <div class="mybk__move">
            <div class="form__row">
              <label class="field"><span class="form__label">Новая дата</span><input type="date" data-f="date"></label>
              <label class="field"><span class="form__label">Время</span><select data-f="time"><option value="">Сначала дата</option></select></label>
            </div>
            <button class="btn btn--primary btn--sm" data-act="save" disabled>Перенести на это время</button>
          </div>
        </article>`).join('');

      body.innerHTML = `
        <div class="account__user">
          ${u.picture ? `<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">` : ''}
          <div><b id="accountTitle">${esc(u.name || 'Личный кабинет')}</b><span>${esc(u.email)}</span></div>
          <button class="account__logout" data-act="logout" type="button">Выйти</button>
        </div>
        <h3>Мои записи</h3>
        ${items ? `<div class="mybk">${items}</div>` : `<div class="account__empty">Будущих записей нет.<br><button class="btn btn--primary btn--sm" data-act="book">Записаться</button></div>`}
        <p class="account__msg" id="accountMsg"></p>
        <p class="account__fine">Здесь видны записи, оставленные на почту ${esc(u.email)}.</p>`;
    }

    // Свободное время на дату (без своего текущего слота)
    async function fillTimes(item, b) {
      const date = item.querySelector('[data-f="date"]').value;
      const sel = item.querySelector('[data-f="time"]');
      const save = item.querySelector('[data-act="save"]');
      save.disabled = true;
      if (!date) return;
      sel.innerHTML = '<option value="">Загружаю…</option>';
      let taken = [], closed = null;
      try { const r = await (await fetch(`/api/slots?date=${date}`, { cache: 'no-store' })).json(); taken = r.taken || []; closed = r.closed; } catch (e) { /* ничего */ }
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes() + 30;
      const pad = (n) => String(n).padStart(2, '0');
      const isToday = date === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const free = closed ? [] : slotsCfg.filter((t) => {
        const [h, m] = t.split(':').map(Number);
        return !taken.includes(t) && !(isToday && h * 60 + m < nowMin) && !(date === b.date && t === b.time);
      });
      sel.innerHTML = free.length
        ? '<option value="">Выбрать</option>' + free.map((t) => `<option>${esc(t)}</option>`).join('')
        : `<option value="">${closed ? esc(closed) + ' — записи нет' : 'Свободного времени нет'}</option>`;
    }

    body.addEventListener('change', (e) => {
      const item = e.target.closest('.mybk__item');
      if (!item) return;
      const b = st.bookings.find((x) => x.id === item.dataset.id);
      if (e.target.dataset.f === 'date') fillTimes(item, b);
      if (e.target.dataset.f === 'time') item.querySelector('[data-act="save"]').disabled = !e.target.value;
    });

    body.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'logout') {
        try { await api({ action: 'logout' }); } catch (err) { /* всё равно выходим */ }
        try { google.accounts.id.disableAutoSelect(); } catch (err) { /* скрипт не загружен */ }
        st.user = null; st.bookings = [];
        paintButton(); render();
        return;
      }
      if (act === 'book') {
        close();
        $('#booking').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
        return;
      }
      const item = a.closest('.mybk__item');
      const b = item && st.bookings.find((x) => x.id === item.dataset.id);
      if (!b) return;
      if (act === 'move') {
        const box = item.querySelector('.mybk__move');
        box.classList.toggle('is-open');
        const d = item.querySelector('[data-f="date"]');
        const pad = (n) => String(n).padStart(2, '0');
        const iso = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
        const max = new Date(); max.setDate(max.getDate() + 60);
        d.min = iso(new Date()); d.max = iso(max);
        if (box.classList.contains('is-open')) d.focus();
        return;
      }
      if (act === 'cancel') {
        if (!confirm(`Отменить запись на ${human(b.date)}, ${b.time}? Время освободится для других.`)) return;
        a.disabled = true; say('Отменяю…');
        try {
          const out = await api({ action: 'cancel', id: b.id });
          st.bookings = out.bookings; render(); say('Запись отменена. Письмо с подтверждением отправлено.', 'is-ok');
        } catch (err) { a.disabled = false; say(err.message, 'is-error'); }
        return;
      }
      if (act === 'save') {
        const date = item.querySelector('[data-f="date"]').value;
        const time = item.querySelector('[data-f="time"]').value;
        a.disabled = true; say('Переношу…');
        try {
          const out = await api({ action: 'move', id: b.id, date, time });
          st.bookings = out.bookings; render(); say(`Готово! Новое время: ${human(date)}, ${time}.`, 'is-ok');
        } catch (err) {
          a.disabled = false; say(err.message, 'is-error');
          if (err.taken) fillTimes(item, b);
        }
      }
    });

    // Окно кабинета
    let lastFocus = null;
    function open() {
      lastFocus = document.activeElement;
      render();
      const sbw = innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = sbw ? sbw + 'px' : '';
      document.body.classList.add('is-locked');
      modalEl.hidden = false;
      void modalEl.offsetWidth;
      modalEl.classList.add('is-open');
      $('.modal__close', modalEl).focus({ preventScroll: true });
    }
    function close() {
      if (modalEl.hidden) return;
      modalEl.classList.remove('is-open');
      setTimeout(() => {
        modalEl.hidden = true;
        document.body.classList.remove('is-locked');
        document.body.style.paddingRight = '';
        lastFocus && lastFocus.focus({ preventScroll: true });
      }, reducedMotion ? 0 : 400);
    }
    btn.addEventListener('click', open);
    modalEl.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalEl.hidden) close(); });

    async function init(site) {
      if (Array.isArray(site && site.slots) && site.slots.length) slotsCfg = site.slots;
      try {
        const out = await api();
        Object.assign(st, { enabled: out.enabled, clientId: out.clientId, user: out.user, bookings: out.bookings || [] });
      } catch (e) { st.enabled = false; } // нет сервера (например, GitHub Pages) — кабинет скрыт
      paintButton();
      autofill();
      if (location.hash === '#account' && st.enabled) open();
    }
    // После новой записи — обновить список в кабинете
    async function refresh() {
      if (!st.user) return;
      try { const out = await api(); st.bookings = out.bookings || []; } catch (e) { /* ничего */ }
    }
    return { init, refresh };
  })();

  /* ---------- ЗАПУСК ---------- */
  // Сначала то, что не зависит от контента
  initTheme();
  initNav();
  initToTop();
  initParticles();
  initCursor();
  initParallax();

  // Затем загружаем контент из content/*.json и строим карточки
  loadContent().then((ok) => {
    applySite(DATA.site);
    initBooking(DATA.site);
    account.init(DATA.site);
    renderPosts();
    renderFiles();
    renderVideos();
    renderLinks();
    renderChips();
    likes.load();
    applyFilters();
    if (!ok) {
      $$('.empty').forEach((el) => {
        el.hidden = false;
        el.textContent = location.protocol === 'file:'
          ? 'Контент не загрузился: при открытии файла напрямую браузер не даёт читать content/*.json. Запустите локальный сервер (см. README).'
          : 'Не удалось загрузить контент. Обновите страницу.';
      });
    }
    fillFileSizes();

    initSearch();
    initModal();
    initVideos();
    initReveal();
    initTilt();
    initMagnetic();
    initPreloader();
  });

  $('#year').textContent = new Date().getFullYear();
})();
