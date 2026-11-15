# Личный блог Denys Savenko

Чистый HTML + CSS + JS, без фреймворков и сборки.
Сайт: https://blog-com-ten.vercel.app · админка: https://blog-com-ten.vercel.app/admin/

```
index.html        — разметка, SEO и Open Graph
style.css         — оформление, палитра в CSS-переменных (:root)
script.js         — логика и анимации
content/*.json    — ВЕСЬ контент: посты, файлы, видео, ссылки, настройки сайта
admin/            — админка (Sveltia CMS) и её настройки config.yml
files/            — файлы для скачивания
images/           — аватар, favicon, обложки
```

## Админка
1. Откройте `/admin/` и нажмите «Войти с помощью токена доступа».
2. Создайте токен GitHub: https://github.com/settings/personal-access-tokens/new
   - Repository access → Only select repositories → `blog-com`
   - Permissions → Repository permissions → **Contents: Read and write**
3. Вставьте токен в админку. Он хранится только в этом браузере.

Каждое «Сохранить» в админке — это коммит в репозиторий. Vercel и GitHub Pages
обновляют сайт сами примерно за минуту.

Текст постов и «Обо мне» пишется в Markdown: `## подзаголовок`, `- список`,
`> цитата`, `**жирный**`, `*курсив*`, `[ссылка](https://…)`.

## Открыть локально
Контент грузится из JSON, поэтому двойной клик по `index.html` не сработает —
нужен локальный сервер:

```
python3 -m http.server 8000
```
и откройте http://localhost:8000
