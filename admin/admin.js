/* =====================================================================
   АДМИНКА БЛОГА
   Контент лежит в репозитории GitHub (content/*.json, images/, files/).
   Чтение и сохранение — через GitHub API с вашим токеном (только в этом браузере).
   Каждое сохранение = коммит; Vercel и GitHub Pages обновляют сайт сами.

   Разделы: Обзор, Посты (редактор с предпросмотром), Файлы, Видео, Ссылки, Настройки.
   Маршруты: #/  #/posts  #/posts/new  #/posts/<id>  #/files  #/videos  #/links  #/settings
   ===================================================================== */
(() => {
  'use strict';

  const REPO = 'fiften1/blog-com';
  const BRANCH = 'main';
  const PATHS = { posts: 'content/posts.json', files: 'content/files.json', videos: 'content/videos.json', links: 'content/links.json', site: 'content/site.json' };

  /* ---------- Утилиты ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const pad = (n) => String(n).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtDate = (iso) => { const d = new Date(`${iso}T00:00:00`); return isNaN(d) ? (iso || '') : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); };
  const ago = (date) => {
    const s = (Date.now() - new Date(date)) / 1000;
    if (s < 60) return 'только что';
    if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
    if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)} дн назад`;
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(date));
  };
  const newId = () => { const a = 'abcdefghijklmnopqrstuvwxyz234567'; const b = crypto.getRandomValues(new Uint8Array(26)); return [...b].map((x) => a[x % 32]).join(''); };
  // site-relative путь → адрес для показа в админке (она лежит в /admin/)
  const src = (p) => (!p ? '' : /^(https?:|data:|\/)/.test(p) ? p : `../${p}`);
  const ytId = (s) => { const m = String(s || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/); return m ? m[1] : (/^[\w-]{11}$/.test(s) ? s : ''); };
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

  /* ---------- Иконки ---------- */
  const I = {
    home: '<path d="M3 11 12 4l9 7v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    posts: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    files: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    videos: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
    links: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    upload: '<path d="M12 16V4M6 10l6-6 6 6M5 20h14"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    save: '<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v6h8V3M7 21v-7h10v7"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    quote: '<path d="M7 7h4v4H7zM7 11c0 3-1 5-3 6M15 7h4v4h-4zM15 11c0 3-1 5-3 6"/>',
    zip: '<path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M1 3h22v5H1zM10 12h4"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[name] || ''}</svg>`;

  /* ---------- Markdown → HTML (как на сайте) ---------- */
  const safeUrl = (u) => (/^(https?:|mailto:|\/|\.|#)/i.test(u) || /^[\w.-]+(\/[\w.\-%]*)*$/.test(u) ? u : '#');
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, s) => `<img src="${src(safeUrl(s))}" alt="${alt}">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, href) => `<a href="${safeUrl(href)}" target="_blank" rel="noopener">${txt}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  function markdown(srcText = '') {
    const out = []; let list = null, para = [], quote = [];
    const flush = () => {
      if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; }
      if (quote.length) { out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`); quote = []; }
      if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; }
    };
    String(srcText).replace(/\r/g, '').split('\n').forEach((raw) => {
      const line = raw.trim(); let m;
      if (!line) return flush();
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flush(); const n = m[1].length >= 4 ? 4 : 3; out.push(`<h${n}>${inline(m[2])}</h${n}>`); return; }
      if ((m = line.match(/^>\s?(.*)$/))) { if (para.length || list) flush(); quote.push(m[1]); return; }
      if ((m = line.match(/^([-*+]|\d+[.)])\s+(.*)$/))) {
        const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (para.length || quote.length || (list && list.tag !== tag)) flush();
        list = list || { tag, items: [] }; list.items.push(m[2]); return;
      }
      if (list || quote.length) flush();
      para.push(line);
    });
    flush();
    return out.join('\n');
  }

  /* ---------- Токен и GitHub API ---------- */
  const TOKEN_KEY = 'admin.githubToken';
  function savedToken() {
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      if (t) return t;
      // токен старой админки Sveltia (тот же адрес сайта) — чтобы не вводить заново
      const sv = JSON.parse(localStorage.getItem('sveltia-cms.user') || 'null');
      return sv && sv.token ? sv.token : '';
    } catch (e) { return ''; }
  }
  let TOKEN = '';

  async function gh(path, opts = {}) {
    const r = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
      cache: 'no-store'
    });
    if (r.status === 401) { logout('Токен больше не действует — войдите заново.'); throw new Error('Нет доступа'); }
    const data = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error((data && data.message) || `GitHub: ${r.status}`), { status: r.status });
    return data;
  }

  // base64 <-> UTF-8 (без переполнения на больших файлах)
  const bytesToB64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const encUtf8 = (str) => bytesToB64(new TextEncoder().encode(str));
  const decUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

  async function readJson(path) {
    const f = await gh(`/repos/${REPO}/contents/${path}?ref=${BRANCH}`);
    return { data: JSON.parse(decUtf8(f.content)), sha: f.sha };
  }
  const putFile = (path, b64, message, sha) => gh(`/repos/${REPO}/contents/${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: b64, branch: BRANCH, ...(sha ? { sha } : {}) })
  });

  /* ---------- Данные ---------- */
  const store = { posts: [], files: [], videos: [], links: [], site: {}, user: null };
  const listKey = { posts: 'posts', files: 'files', videos: 'videos', links: 'links' };

  async function loadAll() {
    const kinds = Object.keys(PATHS);
    const res = await Promise.all(kinds.map((k) => readJson(PATHS[k]).catch(() => ({ data: k === 'site' ? {} : { [k]: [] } }))));
    kinds.forEach((k, i) => { store[k] = k === 'site' ? res[i].data : (res[i].data[listKey[k]] || []); });
  }

  // Изменить файл контента: берём свежую версию с GitHub, применяем правку, сохраняем.
  // Так правки из других мест (бот, старая админка) не затираются.
  async function mutate(kind, fn, message) {
    setChip('saving', 'Сохраняю…');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, sha } = await readJson(PATHS[kind]);
        const name = listKey[kind];
        // временный _key помогает найти редактируемую запись (у файлов/видео/ссылок нет id)
        if (name && Array.isArray(data[name])) data[name].forEach((x) => { x._key = `${keyOf(x)}|${x.title}`; });
        const next = fn(clone(data));
        if (name && Array.isArray(next[name])) next[name].forEach((x) => delete x._key);
        await putFile(PATHS[kind], encUtf8(JSON.stringify(next, null, 2) + '\n'), `Админка: ${message}`, sha);
        store[kind] = kind === 'site' ? next : next[listKey[kind]];
        setChip('ok', 'Сохранено · сайт обновится ~1 мин');
        renderNav();
        return next;
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && attempt < 2) continue; // кто-то сохранил одновременно — повторяем
        setChip('error', 'Ошибка сохранения');
        throw e;
      }
    }
  }
  const upsert = (arr, item, key = 'id') => { const i = arr.findIndex((x) => x[key] === item[key]); if (i >= 0) arr[i] = { ...arr[i], ...item }; else arr.unshift(item); return arr; };
  // Записи без id (файлы, видео, ссылки) узнаём по ссылке/файлу и названию
  const keyOf = (x) => x.file || x.youtube || x.youtubeId || x.url || x.title;

  /* ---------- Загрузка файлов и картинок ---------- */
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g' };
  const slug = (name) => {
    const dot = name.lastIndexOf('.');
    const base = (dot > 0 ? name.slice(0, dot) : name).toLowerCase().replace(/[а-яёіїєґ]/g, (c) => TR[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'file';
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    return { base, ext };
  };

  // Фото для сайта: две версии — 800 px (карточки, телефоны) и 1600 px (открытый пост, большие экраны).
  // Формат WebP (если браузер не умеет — JPEG). Сайт сам выбирает нужную версию под экран.
  async function encodeImage(bmp, max, q) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    let blob = await new Promise((res) => c.toBlob(res, 'image/webp', q));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q + 0.08));
    return blob;
  }
  async function photoVersions(file) {
    if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/.test(file.type)) return null; // svg, gif — как есть
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const big = await encodeImage(bmp, 1600, 0.7);
      const small = await encodeImage(bmp, 800, 0.72);
      if (!big || !small) return null;
      return { big, small, ext: big.type === 'image/webp' ? 'webp' : 'jpg' };
    } catch (e) { return null; }
  }

  async function upload(file, folder) {
    const v = folder === 'images' ? await photoVersions(file) : null;
    const blob = v ? v.big : file;
    if (blob.size > 25 * 1024 * 1024) throw new Error('Файл больше 25 МБ — GitHub его не примет.');
    const { base, ext } = slug(file.name);
    const b64 = bytesToB64(new Uint8Array(await blob.arrayBuffer()));
    const b64small = v ? bytesToB64(new Uint8Array(await v.small.arrayBuffer())) : null;
    for (let i = 0; i < 5; i++) {
      const stem = `${base}${i ? '-' + Math.random().toString(36).slice(2, 6) : ''}`;
      const path = v ? `${folder}/${stem}-1600.${v.ext}` : `${folder}/${stem}${ext ? '.' + ext : ''}`;
      try {
        await putFile(path, b64, `Админка: загружен ${path}`);
        if (v) await putFile(`${folder}/${stem}-800.${v.ext}`, b64small, `Админка: загружен ${folder}/${stem}-800.${v.ext}`);
        return path;
      } catch (e) {
        if (e.status === 422) continue; // такое имя уже есть — пробуем другое
        throw e;
      }
    }
    throw new Error('Не удалось подобрать имя файла.');
  }
  // Выбор файла через окно
  const pickFile = (accept) => new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; if (accept) inp.accept = accept;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
  // Зона перетаскивания
  function bindDrop(el, onFile) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('is-over'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-over'); const f = e.dataTransfer.files[0]; if (f) onFile(f); });
  }

  /* ---------- Тост, статус сохранения ---------- */
  let toastT;
  function toast(text, isError) {
    const t = $('#toast'); t.textContent = text; t.classList.toggle('is-error', !!isError); t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2600);
  }
  let chipT;
  function setChip(kind, text) {
    const c = $('#saveChip'); c.hidden = false; c.className = `chip is-${kind}`; c.textContent = text;
    clearTimeout(chipT); if (kind === 'ok') chipT = setTimeout(() => { c.hidden = true; }, 5000);
  }

  /* ---------- Меню слева ---------- */
  const NAV = [
    { route: '', icon: 'home', label: 'Обзор' },
    { group: 'Контент' },
    { route: 'posts', icon: 'posts', label: 'Посты', count: () => store.posts.length },
    { route: 'files', icon: 'files', label: 'Файлы', count: () => store.files.length },
    { route: 'videos', icon: 'videos', label: 'Видео', count: () => store.videos.length },
    { route: 'links', icon: 'links', label: 'Ссылки', count: () => store.links.length },
    { group: 'Сайт' },
    { route: 'settings', icon: 'settings', label: 'Настройки сайта' }
  ];
  function renderNav() {
    const cur = (location.hash.replace(/^#\/?/, '').split('/')[0]) || '';
    $('#nav').innerHTML = NAV.map((n) => n.group
      ? `<div class="side__group">${n.group}</div>`
      : `<a class="side__link ${cur === n.route ? 'is-active' : ''}" href="#/${n.route}" title="${n.label}">${svg(n.icon)}<span>${n.label}</span>${n.count ? `<b class="side__count">${n.count()}</b>` : ''}</a>`).join('');
    $('#siteName').textContent = store.site.name || 'Блог';
  }

  /* ---------- Роутинг и «несохранённые изменения» ---------- */
  let dirty = null; // функция: есть ли несохранённое
  let onSave = null; // что делать по ⌘S
  const isDirty = () => !!(dirty && dirty());
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  let lastHash = location.hash;
  window.addEventListener('hashchange', () => {
    if (isDirty() && !confirm('Есть несохранённые изменения. Уйти без сохранения?')) { history.replaceState(null, '', lastHash); return; }
    lastHash = location.hash;
    route();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (onSave) onSave(); }
    if (e.key === 'Escape' && $('#drawer').classList.contains('is-open')) closeDrawer();
  });

  function setPage(title, actions = '', wide = false) {
    $('#title').textContent = title;
    $('#barActions').innerHTML = actions;
    $('#view').classList.toggle('is-wide', wide);
    document.title = `${title} — админка`;
  }

  function route() {
    dirty = null; onSave = null;
    $('#view').onclick = null;
    $('#saveChip').hidden = true;
    const [section, id] = location.hash.replace(/^#\/?/, '').split('/');
    renderNav();
    window.scrollTo(0, 0);
    switch (section) {
      case 'posts': return id ? viewPostEditor(id) : viewPosts();
      case 'files': return viewFiles();
      case 'videos': return viewVideos();
      case 'links': return viewLinks();
      case 'settings': return viewSettings();
      default: return viewDashboard();
    }
  }

  /* ---------- Обзор ---------- */
  async function viewDashboard() {
    setPage('Обзор', `<a class="btn btn--accent" href="#/posts/new">${svg('plus')}Новый пост</a>`);
    const stat = (r, icon, n, label) => `<a class="stat" href="#/${r}">${svg(icon)}<b>${n}</b><span>${label}</span></a>`;
    $('#view').innerHTML = `
      <div class="stats">
        ${stat('posts', 'posts', store.posts.length, 'постов')}${stat('files', 'files', store.files.length, 'файлов')}
        ${stat('videos', 'videos', store.videos.length, 'видео')}${stat('links', 'links', store.links.length, 'ссылок')}
      </div>
      <div class="grid2">
        <section class="card"><h2>Последние изменения</h2><ul class="commits" id="commits"><li><span class="muted">Загружаю…</span></li></ul></section>
        <section class="card"><h2>Быстрые действия</h2>
          <div class="quick">
            <a class="btn" href="#/posts/new">${svg('plus')}Написать пост</a>
            <a class="btn" href="#/files">${svg('upload')}Загрузить файл</a>
            <a class="btn" href="#/videos">${svg('videos')}Добавить видео</a>
            <a class="btn" href="#/settings">${svg('settings')}Имя, аватар, «Обо мне»</a>
            <a class="btn" href="../" target="_blank" rel="noopener">${svg('ext')}Открыть сайт</a>
          </div>
        </section>
      </div>`;
    try {
      const commits = await gh(`/repos/${REPO}/commits?sha=${BRANCH}&per_page=8`);
      $('#commits').innerHTML = !commits.length ? '<li><span class="muted">Пока нет изменений.</span></li>' : commits.map((c) => `<li><span title="${esc(c.commit.message)}">${esc(c.commit.message.split('\n')[0].replace(/^Админка:\s*/, ''))}</span><time>${ago(c.commit.author.date)}</time></li>`).join('');
    } catch (e) { $('#commits').innerHTML = '<li><span class="muted">Не удалось загрузить историю.</span></li>'; }
  }

  /* ---------- Посты: список ---------- */
  function viewPosts() {
    setPage('Посты', `<a class="btn btn--accent" href="#/posts/new">${svg('plus')}Новый пост</a>`);
    let q = '';
    const draw = () => {
      const list = [...store.posts].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .filter((p) => !q || `${p.title} ${(p.tags || []).join(' ')} ${p.excerpt}`.toLowerCase().includes(q));
      $('#plist').innerHTML = list.length ? list.map((p) => `
        <article class="item is-click" data-id="${esc(p.id)}">
          ${p.cover ? `<img class="thumb" src="${esc(src(p.cover))}" alt="" loading="lazy">` : `<span class="thumb">${svg('image')}</span>`}
          <div><div class="item__title">${esc(p.title || 'Без названия')}</div>
            <div class="item__meta"><span class="mono">${esc(fmtDate(p.date))}</span>${(p.tags || []).map((t) => `<span class="tagpill">${esc(t)}</span>`).join('')}</div></div>
          <div class="item__actions">
            <a class="btn btn--sm" href="#/posts/${esc(p.id)}">${svg('edit')}Редактировать</a>
            <button class="icon-btn" data-del title="Удалить">${svg('trash')}</button>
          </div>
        </article>`).join('')
        : store.posts.length ? '<div class="empty">Ничего не найдено.</div>'
          : `<div class="empty"><h3>Постов пока нет</h3><p>Напишите первый — это займёт пару минут.</p><a class="btn btn--accent" href="#/posts/new">${svg('plus')}Новый пост</a></div>`;
    };
    $('#view').innerHTML = `<div class="toolbar"><input class="input" id="pq" type="search" placeholder="Поиск по заголовку, тегам…"></div><div class="list" id="plist"></div>`;
    $('#pq').addEventListener('input', (e) => { q = e.target.value.toLowerCase().trim(); draw(); });
    $('#plist').addEventListener('click', async (e) => {
      const item = e.target.closest('.item'); if (!item) return;
      const p = store.posts.find((x) => x.id === item.dataset.id);
      if (e.target.closest('[data-del]')) {
        if (!confirm(`Удалить пост «${p.title}»? Это нельзя отменить (но он останется в истории GitHub).`)) return;
        try { await mutate('posts', (d) => { d.posts = d.posts.filter((x) => x.id !== p.id); return d; }, `удалён пост «${p.title}»`); toast('Пост удалён'); draw(); }
        catch (err) { toast(err.message, true); }
        return;
      }
      if (!e.target.closest('a')) location.hash = `#/posts/${p.id}`;
    });
    draw();
  }

  /* ---------- Теги-чипсы ---------- */
  function tagsInput(oldEl, initial, suggestions, onChange) {
    const el = oldEl.cloneNode(false); oldEl.replaceWith(el); // без старых обработчиков
    let tags = [...(initial || [])];
    const listId = `dl-${Math.random().toString(36).slice(2, 7)}`;
    const draw = () => {
      el.innerHTML = tags.map((t, i) => `<span>${esc(t)}<button type="button" data-i="${i}" aria-label="Убрать">×</button></span>`).join('')
        + `<input list="${listId}" placeholder="${tags.length ? '' : 'Добавьте тег и нажмите Enter'}"><datalist id="${listId}">${suggestions.filter((s) => !tags.includes(s)).map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`;
    };
    const add = (v) => { v = v.trim().replace(/,$/, '').trim(); if (v && !tags.includes(v)) { tags.push(v); draw(); onChange(tags); } };
    el.classList.add('tags');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) { tags.splice(+b.dataset.i, 1); draw(); onChange(tags); }
      $('input', el).focus();
    });
    el.addEventListener('keydown', (e) => {
      const inp = e.target; if (inp.tagName !== 'INPUT') return;
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(inp.value); $('input', el).focus(); }
      if (e.key === 'Backspace' && !inp.value && tags.length) { tags.pop(); draw(); onChange(tags); $('input', el).focus(); }
    });
    el.addEventListener('change', (e) => { if (e.target.tagName === 'INPUT' && suggestions.includes(e.target.value)) { add(e.target.value); $('input', el).focus(); } });
    el.addEventListener('focusout', (e) => { if (e.target.tagName === 'INPUT' && e.target.value.trim()) add(e.target.value); });
    draw();
  }
  const allTags = () => [...new Set([...store.posts, ...store.files, ...store.videos, ...store.links].flatMap((x) => x.tags || []))].sort((a, b) => a.localeCompare(b, 'ru'));

  /* ---------- Посты: редактор с предпросмотром ---------- */
  function viewPostEditor(id) {
    const isNew = id === 'new';
    const orig = isNew ? null : store.posts.find((p) => p.id === id);
    if (!isNew && !orig) { $('#view').innerHTML = '<div class="empty"><h3>Пост не найден</h3><a class="btn" href="#/posts">К списку постов</a></div>'; return setPage('Пост'); }
    const base = orig ? clone(orig) : { id: newId(), title: '', date: todayISO(), cover: '', alt: '', tags: [], excerpt: '', body: '' };
    let post = clone(base);
    const draftKey = `admin.draft.${base.id}`;
    let saved = JSON.stringify(base);

    setPage(isNew ? 'Новый пост' : 'Редактирование', `
      <a class="btn btn--ghost" href="#/posts">${svg('back')}К постам</a>
      ${isNew ? '' : `<a class="btn" href="../#post-${esc(base.id)}" target="_blank" rel="noopener">${svg('ext')}На сайте</a><button class="btn btn--danger" id="pdel">${svg('trash')}Удалить</button>`}
      <button class="btn btn--primary" id="psave">${svg('save')}${isNew ? 'Опубликовать' : 'Сохранить'}</button>`, true);

    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (e) { draft = null; }

    $('#view').innerHTML = `
      ${draft && JSON.stringify(draft.post) !== saved ? `<div class="restore" id="restore"><span>Есть несохранённый черновик от ${ago(draft.at)}.</span><span><button class="btn btn--sm" id="rYes">Восстановить</button> <button class="btn btn--sm btn--ghost" id="rNo">Удалить черновик</button></span></div>` : ''}
      <div class="editor">
        <div>
          <input class="title-input" id="fTitle" placeholder="Заголовок поста" maxlength="140">
          <div class="row">
            <div class="field"><label class="label" for="fDate">Дата</label><input class="input" id="fDate" type="date"></div>
            <div class="field"><span class="label">Теги</span><div id="fTags"></div></div>
          </div>
          <div class="field"><span class="label">Обложка</span><div id="fCover"></div>
            <input class="input" id="fAlt" placeholder="Описание обложки — для незрячих и поисковиков" style="margin-top:8px"></div>
          <div class="field"><label class="label" for="fExcerpt">Краткое описание (видно на карточке)</label>
            <textarea class="input" id="fExcerpt" rows="2" maxlength="300" placeholder="1–2 предложения, чтобы захотелось открыть пост"></textarea></div>
          <div class="field"><span class="label">Текст поста</span>
            <div class="mdbar" id="mdbar">
              <button type="button" data-md="h" title="Подзаголовок">H</button>
              <button type="button" data-md="b" title="Жирный"><b>B</b></button>
              <button type="button" data-md="i" title="Курсив"><i>I</i></button>
              <span class="sep"></span>
              <button type="button" data-md="ul" title="Список">${svg('list')}</button>
              <button type="button" data-md="q" title="Цитата">${svg('quote')}</button>
              <button type="button" data-md="a" title="Ссылка">${svg('link')}</button>
              <button type="button" data-md="img" title="Картинка">${svg('image')}</button>
            </div>
            <textarea class="input md" id="fBody" placeholder="Пишите текст. Пустая строка — новый абзац."></textarea>
            <p class="hint">## подзаголовок · **жирный** · *курсив* · - список · > цитата · [текст](ссылка). Сохранить: ⌘S / Ctrl+S</p>
          </div>
        </div>
        <aside class="preview" aria-label="Предпросмотр">
          <div class="preview__label"><span>Предпросмотр поста</span><span id="pWords"></span></div>
          <img class="preview__cover" id="pCover" alt="" hidden>
          <div class="preview__body">
            <div class="preview__meta" id="pMeta"></div>
            <h2 class="preview__title" id="pTitle"></h2>
            <div class="prose" id="pBody"></div>
          </div>
          <div class="preview__label"><span>Карточка в ленте</span></div>
          <div class="card-preview"><img id="cpCover" alt="" hidden><div><b id="cpTitle"></b><p id="cpText"></p></div></div>
        </aside>
      </div>`;

    const fill = () => {
      $('#fTitle').value = post.title || ''; $('#fDate').value = post.date || todayISO();
      $('#fAlt').value = post.alt || ''; $('#fExcerpt').value = post.excerpt || ''; $('#fBody').value = post.body || '';
      tagsInput($('#fTags'), post.tags, allTags(), (t) => { post.tags = [...t]; changed(); });
      drawCover(); preview();
    };

    function drawCover() {
      const box = $('#fCover');
      if (post.cover) {
        box.innerHTML = `<div class="cover"><img src="${esc(src(post.cover))}" alt="">
          <div class="cover__bar"><button class="btn btn--sm" type="button" id="cRep">${svg('upload')}Заменить</button><button class="btn btn--sm" type="button" id="cDel">${svg('trash')}Убрать</button></div></div>`;
        $('#cRep').onclick = async () => { const f = await pickFile('image/*'); if (f) uploadCover(f); };
        $('#cDel').onclick = () => { post.cover = ''; drawCover(); changed(); };
        bindDrop($('.cover', box), uploadCover);
      } else {
        box.innerHTML = `<div class="drop" id="cDrop">${svg('image')}<span><b>Перетащите картинку</b> или нажмите, чтобы выбрать</span><span class="small muted">Большие фото уменьшатся сами</span></div>
          <input class="input" id="cUrl" placeholder="…или вставьте ссылку на картинку (https://…)" style="margin-top:8px">`;
        $('#cDrop').onclick = async () => { const f = await pickFile('image/*'); if (f) uploadCover(f); };
        bindDrop($('#cDrop'), uploadCover);
        $('#cUrl').addEventListener('change', (e) => { if (/^https?:\/\//.test(e.target.value.trim())) { post.cover = e.target.value.trim(); drawCover(); changed(); } });
      }
    }
    async function uploadCover(f) {
      const drop = $('#cDrop'); if (drop) { drop.classList.add('is-busy'); drop.innerHTML = '<span>Загружаю…</span>'; }
      try { post.cover = await upload(f, 'images'); if (!post.alt) post.alt = post.title; toast('Обложка загружена'); }
      catch (e) { toast(e.message, true); }
      drawCover(); changed();
    }

    function preview() {
      const c = src(post.cover);
      $('#pCover').hidden = !c; if (c) $('#pCover').src = c;
      $('#cpCover').hidden = !c; if (c) $('#cpCover').src = c;
      $('#pMeta').innerHTML = `<span>${esc(fmtDate(post.date))}</span>${(post.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}`;
      $('#pTitle').textContent = post.title || 'Заголовок поста';
      $('#pBody').innerHTML = markdown(post.body) || '<p class="muted">Здесь появится текст…</p>';
      $('#cpTitle').textContent = post.title || 'Заголовок';
      $('#cpText').textContent = post.excerpt || 'Краткое описание';
      const words = (post.body || '').trim().split(/\s+/).filter(Boolean).length;
      $('#pWords').textContent = words ? `${words} слов · ~${Math.max(1, Math.round(words / 180))} мин` : '';
    }

    let draftT;
    function changed() {
      preview();
      const d = JSON.stringify(post) !== saved;
      if (d) setChip('dirty', 'Не сохранено'); else $('#saveChip').hidden = true;
      clearTimeout(draftT);
      draftT = setTimeout(() => { try { if (d) localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), post })); else localStorage.removeItem(draftKey); } catch (e) {} }, 500);
    }
    dirty = () => JSON.stringify(post) !== saved;

    const bind = (sel, key) => $(sel).addEventListener('input', (e) => { post[key] = e.target.value; changed(); });
    bind('#fTitle', 'title'); bind('#fDate', 'date'); bind('#fAlt', 'alt'); bind('#fExcerpt', 'excerpt'); bind('#fBody', 'body');

    // Панель форматирования
    const ta = () => $('#fBody');
    function wrap(before, after = before, placeholder = 'текст') {
      const t = ta(); const s = t.selectionStart, e = t.selectionEnd;
      const sel = t.value.slice(s, e) || placeholder;
      t.setRangeText(before + sel + after, s, e, 'select');
      t.selectionStart = s + before.length; t.selectionEnd = s + before.length + sel.length;
      t.focus(); post.body = t.value; changed();
    }
    function linePrefix(prefix) {
      const t = ta(); const s = t.value.lastIndexOf('\n', t.selectionStart - 1) + 1;
      t.setRangeText(prefix, s, s, 'end'); t.focus(); post.body = t.value; changed();
    }
    $('#mdbar').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-md]'); if (!b) return;
      const k = b.dataset.md;
      if (k === 'b') wrap('**');
      if (k === 'i') wrap('*');
      if (k === 'h') linePrefix('## ');
      if (k === 'ul') linePrefix('- ');
      if (k === 'q') linePrefix('> ');
      if (k === 'a') { const url = prompt('Адрес ссылки', 'https://'); if (url) wrap('[', `](${url})`, 'текст ссылки'); }
      if (k === 'img') {
        const f = await pickFile('image/*'); if (!f) return;
        toast('Загружаю картинку…');
        try { const p = await upload(f, 'images'); const t = ta(); t.setRangeText(`\n![](${p})\n`, t.selectionStart, t.selectionEnd, 'end'); post.body = t.value; changed(); toast('Картинка вставлена'); }
        catch (err) { toast(err.message, true); }
      }
    });
    // Картинку можно перетащить прямо в текст
    ta().addEventListener('drop', async (e) => {
      const f = e.dataTransfer.files[0]; if (!f || !f.type.startsWith('image/')) return;
      e.preventDefault(); toast('Загружаю картинку…');
      try { const p = await upload(f, 'images'); const t = ta(); t.setRangeText(`\n![](${p})\n`, t.selectionStart, t.selectionStart, 'end'); post.body = t.value; changed(); toast('Картинка вставлена'); }
      catch (err) { toast(err.message, true); }
    });

    async function save() {
      if (!post.title.trim()) { toast('Напишите заголовок', true); $('#fTitle').focus(); return; }
      const btn = $('#psave'); btn.disabled = true;
      const clean = { ...post, title: post.title.trim(), excerpt: (post.excerpt || '').trim() };
      try {
        await mutate('posts', (d) => { d.posts = d.posts || []; upsert(d.posts, clean); return d; }, `${isNew ? 'новый пост' : 'обновлён пост'} «${clean.title}»`);
        saved = JSON.stringify(post);
        try { localStorage.removeItem(draftKey); } catch (e) {}
        toast(isNew ? 'Пост опубликован! Появится на сайте через ~1 мин' : 'Сохранено');
        if (isNew) { history.replaceState(null, '', `#/posts/${clean.id}`); lastHash = location.hash; route(); }
      } catch (e) { toast(e.message, true); }
      btn.disabled = false;
    }
    onSave = save;
    $('#psave').onclick = save;
    if ($('#pdel')) $('#pdel').onclick = async () => {
      if (!confirm(`Удалить пост «${base.title}»?`)) return;
      try { await mutate('posts', (d) => { d.posts = d.posts.filter((x) => x.id !== base.id); return d; }, `удалён пост «${base.title}»`); saved = JSON.stringify(post); toast('Пост удалён'); location.hash = '#/posts'; }
      catch (e) { toast(e.message, true); }
    };
    if ($('#restore')) {
      $('#rYes').onclick = () => { post = { ...post, ...draft.post }; $('#restore').remove(); fill(); changed(); };
      $('#rNo').onclick = () => { try { localStorage.removeItem(draftKey); } catch (e) {} $('#restore').remove(); };
    }
    fill();
    if (isNew) $('#fTitle').focus();
  }

  /* ---------- Боковая панель (общая форма) ---------- */
  function openDrawer(title, bodyHtml, footHtml, onMount) {
    $('#drawerTitle').textContent = title;
    $('#drawerBody').innerHTML = bodyHtml;
    $('#drawerFoot').innerHTML = footHtml;
    $('#drawer').classList.add('is-open'); $('#drawer').setAttribute('aria-hidden', 'false');
    if (onMount) onMount();
    const first = $('#drawerBody input, #drawerBody textarea'); if (first) setTimeout(() => first.focus(), 250);
  }
  function closeDrawer(force) {
    if (!force && isDirty() && !confirm('Закрыть без сохранения?')) return;
    $('#drawer').classList.remove('is-open'); $('#drawer').setAttribute('aria-hidden', 'true');
    dirty = null; onSave = listSave;
  }
  let listSave = null;
  $('#drawer').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });

  // Универсальный редактор записи (файл / видео / ссылка) в боковой панели
  function editInDrawer({ kind, title, item, isNew, fields, before = '', mount, label }) {
    const it = clone(item); const saved = JSON.stringify(it);
    const body = before + fields.map((f) => `
      <div class="field">${f.type === 'tags' ? `<span class="label">${f.label}</span><div id="d_${f.key}"></div>`
        : `<label class="label" for="d_${f.key}">${f.label}</label>${f.type === 'textarea'
          ? `<textarea class="input" id="d_${f.key}" rows="3" placeholder="${esc(f.placeholder || '')}"></textarea>`
          : `<input class="input" id="d_${f.key}" type="${f.type || 'text'}" placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="dl_${f.key}"` : ''}>${f.list ? `<datalist id="dl_${f.key}">${f.list.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>` : ''}`}`}
        ${f.hint ? `<p class="hint">${f.hint}</p>` : ''}</div>`).join('');
    openDrawer(title, body, `
      ${isNew ? '' : `<button class="btn btn--danger" id="dDel">${svg('trash')}Удалить</button>`}
      <button class="btn btn--ghost" data-close>Отмена</button>
      <button class="btn btn--primary" id="dSave">${svg('save')}Сохранить</button>`, () => {
      fields.forEach((f) => {
        if (f.type === 'tags') return tagsInput($(`#d_${f.key}`), it[f.key], allTags(), (t) => { it[f.key] = [...t]; });
        const el = $(`#d_${f.key}`); el.value = it[f.key] || '';
        el.addEventListener('input', () => { it[f.key] = el.value; if (f.onInput) f.onInput(el.value, it); });
      });
      if (mount) mount(it);
    });
    dirty = () => JSON.stringify(it) !== saved;
    const listName = listKey[kind];
    const doSave = async () => {
      const missing = fields.find((f) => f.required && !String(it[f.key] || '').trim());
      if (missing) { toast(`Заполните «${missing.label}»`, true); $(`#d_${missing.key}`).focus(); return; }
      $('#dSave').disabled = true;
      try {
        await mutate(kind, (d) => { d[listName] = d[listName] || []; upsert(d[listName], it, '_key'); return d; },
          `${isNew ? 'добавлено' : 'обновлено'}: ${label} «${it.title}»`);
        toast('Сохранено'); closeDrawer(true); route();
      } catch (e) { toast(e.message, true); $('#dSave').disabled = false; }
    };
    onSave = doSave;
    $('#dSave').onclick = doSave;
    if ($('#dDel')) $('#dDel').onclick = async () => {
      if (!confirm(`Удалить «${it.title}»?`)) return;
      try {
        await mutate(kind, (d) => { d[listName] = (d[listName] || []).filter((x) => !sameItem(x, item)); return d; }, `удалено: ${label} «${it.title}»`);
        toast('Удалено'); closeDrawer(true); route();
      } catch (e) { toast(e.message, true); }
    };
  }
  const sameItem = (a, b) => keyOf(a) === keyOf(b) && a.title === b.title;
  // помечаем редактируемую запись, чтобы найти её в свежем файле с GitHub
  const withKeys = (kind, item) => ({ ...item, _key: item._key || `${keyOf(item)}|${item.title}` });

  /* ---------- Файлы ---------- */
  const fileType = (f) => { const e = (f.file || '').split('.').pop().toLowerCase(); return e === 'pdf' ? 'PDF' : ['zip', 'rar', '7z'].includes(e) ? 'ZIP' : ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(e) ? 'IMG' : 'DOC'; };
  const fileIcon = (f) => ({ PDF: 'files', ZIP: 'zip', IMG: 'image', DOC: 'doc' }[fileType(f)]);
  function viewFiles() {
    setPage('Файлы', `<button class="btn btn--accent" id="fAdd">${svg('upload')}Загрузить файл</button>`);
    const list = [...store.files].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    $('#view').innerHTML = `
      <div class="drop" id="fDrop" style="margin-bottom:16px">${svg('upload')}<span><b>Перетащите файл сюда</b> или нажмите — PDF, архив, картинка, документ</span></div>
      <div class="list">${list.length ? list.map((f, i) => `
        <article class="item is-click" data-i="${i}">
          <span class="thumb thumb--icon">${svg(fileIcon(f))}</span>
          <div><div class="item__title">${esc(f.title)}</div>
            <div class="item__meta"><span class="mono">${fileType(f)} · ${esc(fmtDate(f.date))}</span><span>${esc((f.file || '').split('/').pop())}</span>${(f.tags || []).map((t) => `<span class="tagpill">${esc(t)}</span>`).join('')}</div></div>
          <div class="item__actions"><a class="icon-btn" href="${esc(src(f.file))}" target="_blank" rel="noopener" title="Открыть файл">${svg('ext')}</a><button class="btn btn--sm">${svg('edit')}Изменить</button></div>
        </article>`).join('') : '<div class="empty"><h3>Файлов пока нет</h3><p>Загрузите первый — посетители смогут его скачать.</p></div>'}</div>`;
    const edit = (f, isNew) => editInDrawer({
      kind: 'files', label: 'файл', isNew, title: isNew ? 'Новый файл' : 'Файл', item: withKeys('files', f),
      before: `<div class="item" style="margin-bottom:16px"><span class="thumb thumb--icon">${svg(fileIcon(f))}</span><div><div class="item__title">${esc((f.file || '').split('/').pop())}</div><div class="item__meta">${fileType(f)}</div></div></div>`,
      fields: [
        { key: 'title', label: 'Название', required: true },
        { key: 'date', label: 'Дата', type: 'date' },
        { key: 'description', label: 'Описание', type: 'textarea', placeholder: 'Что внутри и кому пригодится' },
        { key: 'tags', label: 'Теги', type: 'tags' }
      ]
    });
    const add = async (file) => {
      const d = $('#fDrop'); d.classList.add('is-busy'); d.innerHTML = `<span>Загружаю «${esc(file.name)}»…</span>`;
      try {
        const path = await upload(file, 'files');
        const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        edit({ title: title.charAt(0).toUpperCase() + title.slice(1), file: path, date: todayISO(), description: '', tags: [] }, true);
      } catch (e) { toast(e.message, true); }
      d.classList.remove('is-busy'); d.innerHTML = `${svg('upload')}<span><b>Перетащите файл сюда</b> или нажмите — PDF, архив, картинка, документ</span>`;
    };
    $('#fAdd').onclick = async () => { const f = await pickFile(); if (f) add(f); };
    $('#fDrop').onclick = async () => { const f = await pickFile(); if (f) add(f); };
    bindDrop($('#fDrop'), add);
    $('#view').onclick = (e) => { const it = e.target.closest('.item[data-i]'); if (it && !e.target.closest('a')) edit(list[+it.dataset.i], false); };
  }

  /* ---------- Видео ---------- */
  function viewVideos() {
    setPage('Видео', `<button class="btn btn--accent" id="vAdd">${svg('plus')}Добавить видео</button>`);
    const list = [...store.videos].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    $('#view').innerHTML = `<div class="list">${list.length ? list.map((v, i) => `
      <article class="item is-click" data-i="${i}">
        ${ytId(v.youtube || v.youtubeId) ? `<img class="thumb" src="https://i.ytimg.com/vi/${ytId(v.youtube || v.youtubeId)}/mqdefault.jpg" alt="" loading="lazy">` : `<span class="thumb">${svg('videos')}</span>`}
        <div><div class="item__title">${esc(v.title)}</div>
          <div class="item__meta"><span class="mono">${esc(fmtDate(v.date))}</span>${(v.tags || []).map((t) => `<span class="tagpill">${esc(t)}</span>`).join('')}</div></div>
        <div class="item__actions"><button class="btn btn--sm">${svg('edit')}Изменить</button></div>
      </article>`).join('') : `<div class="empty"><h3>Видео пока нет</h3><p>Вставьте ссылку на YouTube — превью подтянется само.</p></div>`}</div>`;
    const edit = (v, isNew) => editInDrawer({
      kind: 'videos', label: 'видео', isNew, title: isNew ? 'Новое видео' : 'Видео', item: withKeys('videos', { youtube: v.youtube || (v.youtubeId ? `https://www.youtube.com/watch?v=${v.youtubeId}` : ''), ...v }),
      before: '<img class="video-prev" id="vPrev" alt="" hidden>',
      fields: [
        { key: 'youtube', label: 'Ссылка на YouTube', type: 'url', required: true, placeholder: 'https://www.youtube.com/watch?v=…', onInput: (val) => showPrev(val) },
        { key: 'title', label: 'Название', required: true },
        { key: 'date', label: 'Дата', type: 'date' },
        { key: 'description', label: 'Описание', type: 'textarea' },
        { key: 'tags', label: 'Теги', type: 'tags' }
      ],
      mount: (it) => showPrev(it.youtube)
    });
    function showPrev(val) {
      const id = ytId(val); const img = $('#vPrev'); if (!img) return;
      img.hidden = !id; if (id) img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    $('#vAdd').onclick = () => edit({ youtube: '', title: '', date: todayISO(), description: '', tags: [] }, true);
    $('#view').onclick = (e) => { const it = e.target.closest('.item[data-i]'); if (it) edit(list[+it.dataset.i], false); };
  }

  /* ---------- Ссылки ---------- */
  function viewLinks() {
    setPage('Ссылки', `<button class="btn btn--accent" id="lAdd">${svg('plus')}Добавить ссылку</button>`);
    const list = store.links;
    const fav = (u) => (hostOf(u) ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(u))}&sz=64` : '');
    $('#view').innerHTML = `<div class="list">${list.length ? list.map((l, i) => `
      <article class="item is-click" data-i="${i}">
        ${fav(l.url) ? `<img class="thumb thumb--fav" src="${fav(l.url)}" alt="" loading="lazy">` : `<span class="thumb thumb--icon">${svg('links')}</span>`}
        <div><div class="item__title">${esc(l.title)}</div>
          <div class="item__meta"><span class="tagpill">${esc(l.category || 'без категории')}</span><span class="mono">${esc(hostOf(l.url))}</span></div></div>
        <div class="item__actions"><a class="icon-btn" href="${esc(l.url)}" target="_blank" rel="noopener" title="Открыть">${svg('ext')}</a><button class="btn btn--sm">${svg('edit')}Изменить</button></div>
      </article>`).join('') : '<div class="empty"><h3>Ссылок пока нет</h3></div>'}</div>`;
    const cats = [...new Set(store.links.map((l) => l.category).filter(Boolean))];
    const edit = (l, isNew) => editInDrawer({
      kind: 'links', label: 'ссылка', isNew, title: isNew ? 'Новая ссылка' : 'Ссылка', item: withKeys('links', l),
      fields: [
        { key: 'url', label: 'Адрес', type: 'url', required: true, placeholder: 'https://…', onInput: (val, it) => { if (!it.title && hostOf(val)) { const t = hostOf(val).split('.')[0]; $('#d_title').placeholder = t.charAt(0).toUpperCase() + t.slice(1); } } },
        { key: 'title', label: 'Название', required: true },
        { key: 'category', label: 'Категория', list: cats, placeholder: 'Например: Инструменты' },
        { key: 'description', label: 'Описание', type: 'textarea' },
        { key: 'tags', label: 'Теги', type: 'tags' }
      ]
    });
    $('#lAdd').onclick = () => edit({ url: '', title: '', category: '', description: '', tags: [] }, true);
    $('#view').onclick = (e) => { const it = e.target.closest('.item[data-i]'); if (it && !e.target.closest('a')) edit(list[+it.dataset.i], false); };
  }

  /* ---------- Настройки сайта ---------- */
  function viewSettings() {
    setPage('Настройки сайта', `<button class="btn btn--primary" id="sSave">${svg('save')}Сохранить</button>`);
    const site = clone(store.site);
    site.socials = site.socials || []; site.services = site.services || []; site.slots = site.slots || [];
    let saved = JSON.stringify(site);
    $('#view').innerHTML = `
      <div class="settings">
        <section class="card"><h2>Профиль</h2>
          <div class="avatar-edit" style="margin-bottom:16px"><img id="sAva" alt="">
            <div><button class="btn btn--sm" id="sAvaUp">${svg('upload')}Загрузить фото</button><p class="hint">Квадратное фото, лицо по центру.</p></div></div>
          <div class="row">
            <div class="field"><label class="label" for="sName">Имя</label><input class="input" id="sName"></div>
            <div class="field"><label class="label" for="sStatus">Подпись рядом с аватаром</label><input class="input" id="sStatus"></div>
          </div>
        </section>
        <section class="card"><h2>Обо мне</h2>
          <textarea class="input" id="sAbout" rows="5"></textarea><p class="hint">Markdown: **жирный**, *курсив*, [ссылка](https://…). Пустая строка — новый абзац.</p>
        </section>
        <section class="card"><h2>Соцсети</h2><div class="rows" id="sSoc"></div>
          <button class="btn btn--sm" id="sSocAdd" style="margin-top:10px">${svg('plus')}Добавить</button>
          <p class="hint">Для Instagram, Telegram, GitHub, YouTube, Email на сайте будет своя иконка.</p>
        </section>
        <section class="card"><h2>Запись: услуги</h2><div class="timechips" id="sSvc"></div>
          <div class="toolbar" style="margin:10px 0 0"><input class="input" id="sSvcIn" placeholder="Новая услуга"><button class="btn btn--sm" id="sSvcAdd">${svg('plus')}Добавить</button></div>
        </section>
        <section class="card"><h2>Запись: время</h2><div class="timechips" id="sSlots"></div>
          <div class="toolbar" style="margin:10px 0 0"><input class="input" id="sSlotIn" type="time" step="900"><button class="btn btn--sm" id="sSlotAdd">${svg('plus')}Добавить время</button></div>
          <p class="hint">Время, которое клиенты могут выбрать в анкете «Записаться».</p>
        </section>
      </div>`;

    const changed = () => { if (JSON.stringify(site) !== saved) setChip('dirty', 'Не сохранено'); else $('#saveChip').hidden = true; };
    dirty = () => JSON.stringify(site) !== saved;
    const ava = () => { $('#sAva').src = src(site.avatar) || '../images/avatar.svg'; };
    ava();
    [['#sName', 'name'], ['#sStatus', 'status'], ['#sAbout', 'about']].forEach(([sel, k]) => { $(sel).value = site[k] || ''; $(sel).addEventListener('input', (e) => { site[k] = e.target.value; changed(); }); });
    $('#sAvaUp').onclick = async () => {
      const f = await pickFile('image/*'); if (!f) return;
      toast('Загружаю фото…');
      try { site.avatar = await upload(f, 'images'); ava(); changed(); toast('Фото загружено — не забудьте сохранить'); } catch (e) { toast(e.message, true); }
    };

    const drawSoc = () => {
      $('#sSoc').innerHTML = site.socials.map((s, i) => `<div class="rowedit" data-i="${i}">
        <input class="input" data-k="name" value="${esc(s.name)}" placeholder="Название" list="socnames">
        <input class="input" data-k="url" value="${esc(s.url)}" placeholder="https://… или mailto:…">
        <button class="icon-btn" data-del title="Удалить">${svg('trash')}</button></div>`).join('') + '<datalist id="socnames"><option value="Instagram"><option value="Telegram"><option value="GitHub"><option value="YouTube"><option value="Email"></datalist>';
    };
    $('#sSoc').addEventListener('input', (e) => { const r = e.target.closest('.rowedit'); site.socials[+r.dataset.i][e.target.dataset.k] = e.target.value; changed(); });
    $('#sSoc').addEventListener('click', (e) => { if (e.target.closest('[data-del]')) { site.socials.splice(+e.target.closest('.rowedit').dataset.i, 1); drawSoc(); changed(); } });
    $('#sSocAdd').onclick = () => { site.socials.push({ name: '', url: '' }); drawSoc(); changed(); $$('#sSoc input')[site.socials.length * 2 - 2].focus(); };

    const chips = (box, arr, sort) => {
      if (sort) arr.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      $(box).innerHTML = arr.map((v, i) => `<span>${esc(v)}<button type="button" data-i="${i}" aria-label="Убрать">×</button></span>`).join('') || '<span class="muted small" style="border:0">Пусто</span>';
    };
    const drawSvc = () => chips('#sSvc', site.services);
    const drawSlots = () => chips('#sSlots', site.slots, true);
    $('#sSvc').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { site.services.splice(+b.dataset.i, 1); drawSvc(); changed(); } });
    $('#sSlots').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { site.slots.splice(+b.dataset.i, 1); drawSlots(); changed(); } });
    const addSvc = () => { const v = $('#sSvcIn').value.trim(); if (v && !site.services.includes(v)) { site.services.push(v); drawSvc(); changed(); } $('#sSvcIn').value = ''; $('#sSvcIn').focus(); };
    const addSlot = () => { const v = $('#sSlotIn').value; if (/^\d{2}:\d{2}$/.test(v) && !site.slots.includes(v)) { site.slots.push(v); drawSlots(); changed(); } };
    $('#sSvcAdd').onclick = addSvc; $('#sSvcIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSvc(); });
    $('#sSlotAdd').onclick = addSlot; $('#sSlotIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSlot(); });
    drawSoc(); drawSvc(); drawSlots();

    const save = async () => {
      $('#sSave').disabled = true;
      const clean = { ...site, socials: site.socials.filter((s) => s.name.trim() && s.url.trim()) };
      try { await mutate('site', () => clean, 'настройки сайта'); saved = JSON.stringify(site); renderNav(); toast('Настройки сохранены'); }
      catch (e) { toast(e.message, true); }
      $('#sSave').disabled = false;
    };
    onSave = save;
    $('#sSave').onclick = save;
  }

  /* ---------- Вход / выход ---------- */
  function showLogin(msg) {
    $('#app').hidden = true; $('#login').hidden = false;
    $('#loginMsg').textContent = msg || '';
    $('#token').focus();
  }
  function logout(msg) {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    TOKEN = '';
    showLogin(msg);
  }
  async function start(token, fromForm) {
    TOKEN = token.trim();
    try {
      const repo = await gh(`/repos/${REPO}`);
      if (!repo.permissions || !repo.permissions.push) throw new Error('У токена нет права на запись (Contents: Read and write).');
      store.user = await gh('/user').catch(() => null);
      try { localStorage.setItem(TOKEN_KEY, TOKEN); } catch (e) {}
      $('#login').hidden = true; $('#app').hidden = false;
      $('#view').innerHTML = '<div class="stats">' + '<div class="skeleton" style="height:120px"></div>'.repeat(4) + '</div>';
      await loadAll();
      const u = store.user;
      $('#user').innerHTML = `${u && u.avatar_url ? `<img src="${esc(u.avatar_url)}" alt="">` : ''}<div><b>${esc(u ? (u.name || u.login) : 'GitHub')}</b><span class="muted small">${esc(u ? '@' + u.login : '')}</span></div><button type="button" id="logout">Выйти</button>`;
      $('#logout').onclick = () => { if (confirm('Выйти из админки на этом устройстве?')) logout(); };
      route();
    } catch (e) {
      if (fromForm || TOKEN) showLogin(e.status === 404 ? 'Токен не видит репозиторий blog-com — проверьте доступ к репозиторию.' : e.message);
    }
  }

  $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); $('#loginMsg').textContent = 'Проверяю…'; start($('#token').value, true); });
  $('#themeBtn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('admin.theme', next); } catch (e) {}
  };

  const t = savedToken();
  if (t) start(t); else showLogin();
})();
