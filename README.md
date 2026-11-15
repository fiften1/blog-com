# Личный блог Denys Savenko

Чистый HTML + CSS + JS, без фреймворков и сборки.
Сайт: https://blog-com-ten.vercel.app · админка: https://blog-com-ten.vercel.app/admin/

```
index.html        — разметка, SEO и Open Graph
style.css         — оформление, палитра в CSS-переменных (:root)
script.js         — логика и анимации
content/*.json    — ВЕСЬ контент: посты, файлы, видео, ссылки, настройки сайта
admin/            — админка (admin.js, admin.css); запасная Sveltia — admin/cms/
files/            — файлы для скачивания
images/           — аватар, favicon, обложки
```

## Админка
Откройте `/admin/` — своя админка в стиле сайта: меню слева (Обзор, Посты, Файлы,
Видео, Ссылки, Настройки сайта), редактор постов с живым предпросмотром, загрузка
картинок и файлов перетаскиванием, ⌘S / Ctrl+S — сохранить.

Вход — токеном GitHub (хранится только в этом браузере):
https://github.com/settings/personal-access-tokens/new → Only select repositories →
`blog-com` → Permissions → **Contents: Read and write**.

Каждое сохранение — коммит в репозиторий; Vercel и GitHub Pages обновляют сайт
сами примерно за минуту. Запасная старая админка (Sveltia CMS): `/admin/cms/`.

Текст постов и «Обо мне» пишется в Markdown: `## подзаголовок`, `- список`,
`> цитата`, `**жирный**`, `*курсив*`, `[ссылка](https://…)`.

## Открыть локально
Контент грузится из JSON, поэтому двойной клик по `index.html` не сработает —
нужен локальный сервер:

```
python3 -m http.server 8000
```
и откройте http://localhost:8000
