#!/usr/bin/env python3
"""Генератор PDF для раздела «Файлы»: прайс-лист и инструкция-бриф на RU / PL / EN.

Правите тексты или цены в словаре T ниже и запускаете:
    python3 files/src/make_pdfs.py
Нужен установленный Google Chrome (печатает HTML в PDF). Готовые файлы — в files/.
"""
import html, os, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../files
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

PRICES = {'start': 600, 'business': 1450, 'premium': 2950, 'support': 75}

T = {
  'ru': {
    'brand': 'Denys Savenko · Создание сайтов',
    'date': 'Ноябрь 2026',
    'price_title': 'Прайс-лист',
    'price_lead': 'Делаю быстрые современные сайты для людей и малого бизнеса — под ключ и с понятной ценой. Цены в PLN.',
    'incl': 'Что входит', 'time': 'Срок', 'rev': 'Правки', 'popular': 'Популярный',
    'packages': [
      ('Старт', 'start', 'Сайт-визитка', 'Мастер, фрилансер, небольшая услуга', '~1 неделя', '2 круга', [
        'Одна страница: о вас, услуги, цены, контакты',
        'Удобная версия для телефона',
        'Кнопки связи: телефон, WhatsApp/Telegram, Instagram',
        'Карта и часы работы',
        'Форма заявки с уведомлением на почту',
        'Базовое SEO и красивое превью ссылки',
        'Подключение домена']),
      ('Бизнес', 'business', 'Сайт с онлайн-записью', 'Салон, студия, мастер по записи', '2–3 недели', '3 круга', [
        'Всё из пакета «Старт»',
        'До 5 страниц, два языка',
        'Админка — сами меняете тексты, фото и цены',
        'Онлайн-запись на свободное время с календарём',
        'Telegram-бот: клиенты записываются прямо в Telegram',
        'Уведомления о записях и календарь у вас в телефоне',
        'Галерея / портфолио',
        'Статистика посещений']),
      ('Премиум', 'premium', 'Сайт + сервис для клиентов', 'Салоны и студии с несколькими мастерами', '3–5 недель', '4 круга', [
        'Всё из пакета «Бизнес»',
        'Личный кабинет клиента: история визитов, перенос и отмена',
        'Напоминания клиентам о визите',
        'Онлайн-предоплата при записи (BLIK, карта)',
        'Несколько мастеров, у каждого свой график',
        'Отзывы только от реальных клиентов',
        'Синхронизация с Google Календарём',
        '3 месяца правок бесплатно']),
    ],
    'consult_title': 'Консультация — бесплатно',
    'consult_text': '30–60 минут онлайн: разберём задачу, подберём пакет, назову точную цену и срок.',
    'free': '0 zł',
    'terms_title': 'Условия',
    'terms': [
      ('Оплата', '50% предоплата перед началом работы, 50% — после сдачи сайта.'),
      ('Сроки', 'Считаются с момента, когда получены материалы и предоплата.'),
      ('Поддержка', 'Первый месяц после запуска правки бесплатно (в «Премиум» — 3 месяца). Дальше — {support} zł/мес: мелкие изменения, обновления, контроль работы сайта.'),
      ('Домен и хостинг', 'Оплачиваются отдельно по тарифам регистратора и хостинга (хостинг небольшого сайта часто бесплатный). Помогу выбрать, купить и настроить — домен оформляется на вас.'),
    ],
    'note': 'Точная цена фиксируется до начала работы и не меняется без вашего согласия. Нестандартные задачи оцениваю индивидуально.',
    'contact_book': 'Запись на консультацию',
    'guide_title': 'Как заказать сайт',
    'guide_lead': 'Короткая инструкция: как проходит работа, что подготовить и анкета с вашими пожеланиями.',
    'steps_title': 'Как проходит работа',
    'steps': [
      ('Бесплатная консультация', 'Запишитесь на savenko.pl/book или напишите в Instagram.'),
      ('Анкета', 'Заполните анкету из этого файла — коротко и своими словами.'),
      ('Предложение', 'Подбираю пакет, называю точную цену и срок.'),
      ('Предоплата 50%', 'И я начинаю работу.'),
      ('Дизайн', 'Показываю, как будет выглядеть главная страница, вносим правки.'),
      ('Разработка', 'Собираю сайт — вы смотрите его по тестовой ссылке.'),
      ('Запуск', 'Подключаю домен, показываю, как пользоваться админкой, вы оплачиваете оставшиеся 50%. Месяц правок — бесплатно.'),
    ],
    'prep_title': 'Что подготовить',
    'prep': [
      'Логотип (если есть) и фирменные цвета',
      'Тексты: о вас или компании, услуги, цены — можно черновик, помогу довести',
      'Фото: работы, команда, помещение — лучше свои, не из интернета',
      'Контакты: телефон, адрес, часы работы, соцсети',
      '2–3 сайта, которые нравятся, и чем именно',
      'Домен, если уже есть, или пожелания к адресу сайта',
    ],
    'brief_title': 'Анкета: ваши пожелания',
    'brief_lead': 'Не знаете ответа — пропустите, обсудим вместе.',
    'brief': [
      ('Как называется ваш бизнес и чем вы занимаетесь?', 2),
      ('Кто ваши клиенты?', 1),
      ('Что посетитель должен сделать на сайте? (позвонить, записаться, оставить заявку, посмотреть работы…)', 1),
      ('Какие разделы или страницы нужны?', 2),
      ('Что нужно на сайте?', 'checks'),
      ('Сайты, которые нравятся, и чем:', 2),
      ('Стиль и цвета (строгий, яркий, минималистичный…). Что точно не нравится?', 2),
      ('Есть ли уже домен, логотип, тексты, фото?', 1),
      ('Желаемый срок запуска:', 1),
      ('Ориентир по бюджету или пакет:', 1),
      ('Другие пожелания:', 2),
    ],
    'checks': ['Онлайн-запись', 'Несколько языков', 'Админка', 'Галерея', 'Отзывы', 'Уведомления в Telegram'],
    'brief_send': 'Заполненную анкету пришлите в Instagram или принесите на консультацию.',
    'page': 'стр.',
  },
  'pl': {
    'brand': 'Denys Savenko · Tworzenie stron',
    'date': 'Listopad 2026',
    'price_title': 'Cennik',
    'price_lead': 'Tworzę szybkie, nowoczesne strony dla ludzi i małych firm — pod klucz i w jasnej cenie. Ceny w PLN.',
    'incl': 'W pakiecie', 'time': 'Termin', 'rev': 'Poprawki', 'popular': 'Najczęściej wybierany',
    'packages': [
      ('Start', 'start', 'Strona-wizytówka', 'Specjalista, freelancer, mała usługa', 'ok. 1 tydzień', '2 rundy', [
        'Jedna strona: o Tobie, usługi, ceny, kontakt',
        'Wygodna wersja na telefon',
        'Przyciski kontaktu: telefon, WhatsApp/Telegram, Instagram',
        'Mapa i godziny otwarcia',
        'Formularz zgłoszeń z powiadomieniem na e-mail',
        'Podstawowe SEO i ładny podgląd linku',
        'Podłączenie domeny']),
      ('Biznes', 'business', 'Strona z rezerwacją online', 'Salon, studio, specjalista pracujący na wizyty', '2–3 tygodnie', '3 rundy', [
        'Wszystko z pakietu „Start”',
        'Do 5 podstron, dwie wersje językowe',
        'Panel administracyjny — sam zmieniasz teksty, zdjęcia i ceny',
        'Rezerwacja online wolnych terminów z kalendarzem',
        'Bot Telegram: klienci rezerwują wizyty prosto w Telegramie',
        'Powiadomienia o rezerwacjach i kalendarz w Twoim telefonie',
        'Galeria / portfolio',
        'Statystyki odwiedzin']),
      ('Premium', 'premium', 'Strona + serwis dla klientów', 'Salony i studia z kilkoma specjalistami', '3–5 tygodni', '4 rundy', [
        'Wszystko z pakietu „Biznes”',
        'Konto klienta: historia wizyt, przełożenie i odwołanie',
        'Przypomnienia dla klientów o wizycie',
        'Przedpłata online przy rezerwacji (BLIK, karta)',
        'Kilku specjalistów, każdy z własnym grafikiem',
        'Opinie tylko od prawdziwych klientów',
        'Synchronizacja z Kalendarzem Google',
        '3 miesiące poprawek gratis']),
    ],
    'consult_title': 'Konsultacja — bezpłatnie',
    'consult_text': '30–60 minut online: omówimy zadanie, dobierzemy pakiet, podam dokładną cenę i termin.',
    'free': '0 zł',
    'terms_title': 'Warunki',
    'terms': [
      ('Płatność', '50% zaliczki przed rozpoczęciem pracy, 50% po oddaniu strony.'),
      ('Terminy', 'Liczone od otrzymania materiałów i zaliczki.'),
      ('Wsparcie', 'Przez pierwszy miesiąc po uruchomieniu poprawki są bezpłatne (w „Premium” — 3 miesiące). Później {support} zł/mies.: drobne zmiany, aktualizacje, kontrola działania strony.'),
      ('Domena i hosting', 'Płatne osobno według cennika rejestratora i hostingu (hosting małej strony często jest darmowy). Pomogę wybrać, kupić i skonfigurować — domena jest rejestrowana na Ciebie.'),
    ],
    'note': 'Dokładna cena jest ustalana przed rozpoczęciem pracy i nie zmienia się bez Twojej zgody. Niestandardowe zadania wyceniam indywidualnie.',
    'contact_book': 'Zapisz się na konsultację',
    'guide_title': 'Jak zamówić stronę',
    'guide_lead': 'Krótka instrukcja: jak wygląda współpraca, co przygotować i ankieta z Twoimi życzeniami.',
    'steps_title': 'Jak wygląda współpraca',
    'steps': [
      ('Bezpłatna konsultacja', 'Umów się na savenko.pl/book lub napisz na Instagramie.'),
      ('Ankieta', 'Wypełnij ankietę z tego pliku — krótko i własnymi słowami.'),
      ('Oferta', 'Dobieram pakiet, podaję dokładną cenę i termin.'),
      ('Zaliczka 50%', 'I zaczynam pracę.'),
      ('Projekt', 'Pokazuję, jak będzie wyglądać strona główna, wprowadzamy poprawki.'),
      ('Realizacja', 'Buduję stronę — oglądasz ją pod linkiem testowym.'),
      ('Start', 'Podłączam domenę, pokazuję, jak korzystać z panelu, opłacasz pozostałe 50%. Miesiąc poprawek — gratis.'),
    ],
    'prep_title': 'Co przygotować',
    'prep': [
      'Logo (jeśli jest) i kolory firmowe',
      'Teksty: o Tobie lub firmie, usługi, ceny — wystarczy szkic, pomogę dopracować',
      'Zdjęcia: realizacje, zespół, lokal — najlepiej własne, nie z internetu',
      'Kontakt: telefon, adres, godziny otwarcia, social media',
      '2–3 strony, które Ci się podobają, i co dokładnie',
      'Domena, jeśli już jest, albo pomysł na adres strony',
    ],
    'brief_title': 'Ankieta: Twoje życzenia',
    'brief_lead': 'Nie znasz odpowiedzi? Pomiń — omówimy razem.',
    'brief': [
      ('Jak nazywa się Twoja firma i czym się zajmujesz?', 2),
      ('Kim są Twoi klienci?', 1),
      ('Co odwiedzający ma zrobić na stronie? (zadzwonić, zarezerwować, wysłać zapytanie, obejrzeć realizacje…)', 1),
      ('Jakie sekcje lub podstrony są potrzebne?', 2),
      ('Co ma być na stronie?', 'checks'),
      ('Strony, które Ci się podobają, i dlaczego:', 2),
      ('Styl i kolory (elegancki, wyrazisty, minimalistyczny…). Czego na pewno nie chcesz?', 2),
      ('Czy masz już domenę, logo, teksty, zdjęcia?', 1),
      ('Pożądany termin uruchomienia:', 1),
      ('Orientacyjny budżet lub pakiet:', 1),
      ('Inne życzenia:', 2),
    ],
    'checks': ['Rezerwacja online', 'Kilka języków', 'Panel administracyjny', 'Galeria', 'Opinie', 'Powiadomienia w Telegramie'],
    'brief_send': 'Wypełnioną ankietę wyślij na Instagramie lub przynieś na konsultację.',
    'page': 'str.',
  },
  'en': {
    'brand': 'Denys Savenko · Web design',
    'date': 'November 2026',
    'price_title': 'Price list',
    'price_lead': 'I build fast, modern websites for people and small businesses — turnkey, with a clear price. Prices in PLN.',
    'incl': 'Includes', 'time': 'Timeline', 'rev': 'Revisions', 'popular': 'Most popular',
    'packages': [
      ('Start', 'start', 'Business-card site', 'Specialist, freelancer, small service', '~1 week', '2 rounds', [
        'One page: about you, services, prices, contacts',
        'Mobile-friendly version',
        'Contact buttons: phone, WhatsApp/Telegram, Instagram',
        'Map and opening hours',
        'Enquiry form with email notifications',
        'Basic SEO and a nice link preview',
        'Domain setup']),
      ('Business', 'business', 'Website with online booking', 'Salon, studio, anyone working by appointment', '2–3 weeks', '3 rounds', [
        'Everything in “Start”',
        'Up to 5 pages, two languages',
        'Admin panel — edit texts, photos and prices yourself',
        'Online booking of free time slots with a calendar',
        'Telegram bot: clients book right inside Telegram',
        'Booking alerts and a calendar on your phone',
        'Gallery / portfolio',
        'Visitor statistics']),
      ('Premium', 'premium', 'Website + client service', 'Salons and studios with several specialists', '3–5 weeks', '4 rounds', [
        'Everything in “Business”',
        'Client account: visit history, reschedule and cancel',
        'Appointment reminders for clients',
        'Online deposit when booking (BLIK, card)',
        'Several specialists, each with their own schedule',
        'Reviews only from real clients',
        'Google Calendar sync',
        '3 months of free edits']),
    ],
    'consult_title': 'Consultation — free',
    'consult_text': '30–60 minutes online: we discuss your task, pick a package, and I give you the exact price and timeline.',
    'free': '0 zł',
    'terms_title': 'Terms',
    'terms': [
      ('Payment', '50% upfront before work starts, 50% when the website is delivered.'),
      ('Timelines', 'Counted from when I receive the materials and the upfront payment.'),
      ('Support', 'Edits are free for the first month after launch (3 months with “Premium”). After that — {support} zł/month: small changes, updates, keeping an eye on the site.'),
      ('Domain and hosting', 'Paid separately at the registrar’s and host’s rates (hosting for a small site is often free). I’ll help you choose, buy and set them up — the domain is registered in your name.'),
    ],
    'note': 'The exact price is agreed before work starts and won’t change without your consent. Custom tasks are quoted individually.',
    'contact_book': 'Book a consultation',
    'guide_title': 'How to order a website',
    'guide_lead': 'A short guide: how we work together, what to prepare, and a questionnaire for your wishes.',
    'steps_title': 'How it works',
    'steps': [
      ('Free consultation', 'Book at savenko.pl/book or message me on Instagram.'),
      ('Questionnaire', 'Fill in the questionnaire in this file — briefly, in your own words.'),
      ('Proposal', 'I pick a package and give you the exact price and timeline.'),
      ('50% upfront', 'And I start working.'),
      ('Design', 'I show you how the home page will look, and we make changes.'),
      ('Development', 'I build the site — you watch progress on a test link.'),
      ('Launch', 'I connect the domain, show you how to use the admin panel, you pay the remaining 50%. One month of free edits.'),
    ],
    'prep_title': 'What to prepare',
    'prep': [
      'Logo (if you have one) and brand colours',
      'Texts: about you or your company, services, prices — a draft is fine, I’ll help polish it',
      'Photos: your work, team, premises — preferably your own, not from the internet',
      'Contacts: phone, address, opening hours, social media',
      '2–3 websites you like, and what exactly you like',
      'Your domain if you already have one, or ideas for the address',
    ],
    'brief_title': 'Questionnaire: your wishes',
    'brief_lead': 'Don’t know an answer? Skip it — we’ll figure it out together.',
    'brief': [
      ('What is your business called and what do you do?', 2),
      ('Who are your clients?', 1),
      ('What should a visitor do on the site? (call, book, send an enquiry, see your work…)', 1),
      ('Which sections or pages do you need?', 2),
      ('What should the site have?', 'checks'),
      ('Websites you like, and why:', 2),
      ('Style and colours (strict, bold, minimal…). What do you definitely not want?', 2),
      ('Do you already have a domain, logo, texts, photos?', 1),
      ('Desired launch date:', 1),
      ('Approximate budget or package:', 1),
      ('Anything else:', 2),
    ],
    'checks': ['Online booking', 'Several languages', 'Admin panel', 'Gallery', 'Reviews', 'Telegram notifications'],
    'brief_send': 'Send the completed questionnaire on Instagram or bring it to the consultation.',
    'page': 'p.',
  },
}

CSS = """
@page { size: A4; margin: 11mm 14mm 12mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #2a2a38; font-size: 10.2pt; line-height: 1.45; }
.top { display: flex; justify-content: space-between; align-items: center; font-size: 8.6pt; color: #77778a; padding-bottom: 8px; border-bottom: 1px solid #e7e5ef; }
.top b { color: #2a2a38; font-weight: 600; }
.bar { height: 4px; border-radius: 4px; background: linear-gradient(90deg, #a855f7, #ec4899 55%, #22d3ee); margin: 0 0 22px; }
h1 { font-size: 26pt; line-height: 1.1; margin: 14px 0 6px; color: #12121c; letter-spacing: -0.02em; }
.lead { font-size: 11pt; color: #55556a; margin: 0 0 16px; max-width: 150mm; }
h2 { font-size: 13.5pt; margin: 16px 0 8px; color: #12121c; letter-spacing: -0.01em; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.pkg { border: 1px solid #e3e0ec; border-radius: 12px; padding: 14px 13px 12px; position: relative; break-inside: avoid; display: flex; flex-direction: column; }
.pkg.hot { border: 1.5px solid #a855f7; box-shadow: 0 0 0 3px rgba(168,85,247,.08); }
.badge { position: absolute; top: -9px; left: 12px; background: #a855f7; color: #fff; font-size: 7.4pt; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
.pkg .name { font-size: 9pt; font-weight: 600; color: #a855f7; text-transform: uppercase; letter-spacing: .06em; }
.pkg .kind { font-weight: 600; font-size: 11pt; color: #12121c; margin-top: 2px; }
.pkg .for { font-size: 8.4pt; color: #77778a; margin-top: 2px; min-height: 2.6em; }
.price { font-size: 22pt; font-weight: 700; color: #12121c; margin: 8px 0 8px; letter-spacing: -0.02em; }
.price small { font-size: 11pt; font-weight: 600; color: #55556a; }
.pkg ul { list-style: none; padding: 0; margin: 0 0 10px; font-size: 8.8pt; flex: 1; }
.pkg li { padding-left: 15px; position: relative; margin: 0 0 3px; line-height: 1.38; }
.pkg li::before { content: ''; position: absolute; left: 0; top: .5em; width: 7px; height: 7px; border-radius: 50%; background: linear-gradient(135deg, #a855f7, #22d3ee); }
.facts { border-top: 1px dashed #e3e0ec; padding-top: 8px; font-size: 8.4pt; color: #55556a; display: flex; flex-direction: column; gap: 2px; }
.facts b { white-space: nowrap; }
.facts b { color: #2a2a38; font-weight: 600; }
.consult { margin-top: 10px; display: flex; align-items: center; gap: 14px; background: #f6f2fd; border-radius: 12px; padding: 12px 16px; break-inside: avoid; }
.consult .p { font-size: 18pt; font-weight: 700; color: #a855f7; white-space: nowrap; }
.consult b { display: block; color: #12121c; font-size: 10.5pt; }
.consult span { font-size: 9pt; color: #55556a; }
.terms { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; }
.term { break-inside: avoid; font-size: 9pt; line-height: 1.4; }
.term b { display: block; color: #12121c; font-size: 9.6pt; margin-bottom: 1px; }
.note { font-size: 8.6pt; color: #77778a; margin: 10px 0 0; }
.contact { margin-top: 12px; display: flex; gap: 22px; flex-wrap: wrap; font-size: 9.4pt; padding: 11px 16px; border: 1px solid #e3e0ec; border-radius: 12px; break-inside: avoid; }
.contact span { color: #77778a; }
.contact b { color: #12121c; }
ol.steps { list-style: none; counter-reset: s; padding: 0; margin: 0; display: grid; gap: 7px; }
ol.steps li { counter-increment: s; display: grid; grid-template-columns: 26px 1fr; gap: 10px; align-items: start; break-inside: avoid; }
ol.steps li::before { content: counter(s); width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #a855f7, #ec4899); color: #fff; font-weight: 600; font-size: 9pt; display: grid; place-items: center; }
ol.steps b { color: #12121c; }
ul.prep { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 22px; font-size: 9.4pt; }
ul.prep li { padding-left: 22px; position: relative; break-inside: avoid; }
ul.prep li::before, .check::before { content: ''; position: absolute; left: 0; top: .15em; width: 12px; height: 12px; border: 1.5px solid #a855f7; border-radius: 3px; }
.brk { break-before: page; }
.q { break-inside: avoid; margin: 0 0 12px; }
.q .t { font-weight: 600; color: #12121c; font-size: 9.6pt; }
.q .t i { font-style: normal; color: #a855f7; margin-right: 6px; }
.line { border-bottom: 1px solid #cfcbdb; height: 24px; }
.checks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px 14px; margin: 8px 0 18px; font-size: 9.2pt; }
.check { position: relative; padding-left: 20px; }
.hint { color: #77778a; font-size: 9pt; margin: -4px 0 14px; }
.foot { margin-top: 18px; font-size: 9pt; color: #55556a; }
"""


def e(s):
    return html.escape(s)


def page(lang, title, body):
    t = T[lang]
    return f"""<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><title>{e(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=block">
<style>{CSS}</style></head><body>
<div class="top"><b>{e(t['brand'])}</b><span>savenko.pl · {e(t['date'])}</span></div>
{body}</body></html>"""


def contact(t):
    return f"""<div class="contact"><div><span>{e(t['contact_book'])}:</span> <b>savenko.pl/book</b></div>
<div><span>Instagram:</span> <b>@den1s_1</b></div><div><span>Web:</span> <b>savenko.pl</b></div></div>"""


def price_html(lang):
    t = T[lang]
    cards = []
    for name, key, kind, who, time, rev, items in t['packages']:
        hot = key == 'business'
        cards.append(f"""<div class="pkg{' hot' if hot else ''}">{f'<span class="badge">{e(t["popular"])}</span>' if hot else ''}
<div class="name">{e(name)}</div><div class="kind">{e(kind)}</div><div class="for">{e(who)}</div>
<div class="price">{f'{PRICES[key]:,}'.replace(',', ' ')} <small>zł</small></div>
<ul>{''.join(f'<li>{e(i)}</li>' for i in items)}</ul>
<div class="facts"><span>{e(t['time'])}: <b>{e(time)}</b></span><span>{e(t['rev'])}: <b>{e(rev)}</b></span></div></div>""")
    terms = ''.join(f'<div class="term"><b>{e(a)}</b>{e(b.format(**PRICES))}</div>' for a, b in t['terms'])
    body = f"""<h1>{e(t['price_title'])}</h1><p class="lead">{e(t['price_lead'])}</p>
<div class="grid">{''.join(cards)}</div>
<div class="consult"><div class="p">{e(t['free'])}</div><div><b>{e(t['consult_title'])}</b><span>{e(t['consult_text'])}</span></div></div>
<h2>{e(t['terms_title'])}</h2><div class="terms">{terms}</div>
<p class="note">{e(t['note'])}</p>{contact(t)}"""
    return page(lang, t['price_title'], body)


def guide_html(lang):
    t = T[lang]
    steps = ''.join(f'<li><div><b>{e(a)}.</b> {e(b)}</div></li>' for a, b in t['steps'])
    prep = ''.join(f'<li>{e(p)}</li>' for p in t['prep'])
    qs = []
    for n, (q, lines) in enumerate(t['brief'], 1):
        if lines == 'checks':
            inner = '<div class="checks">' + ''.join(f'<span class="check">{e(c)}</span>' for c in t['checks']) + '</div>'
        else:
            inner = '<div class="line"></div>' * lines
        qs.append(f'<div class="q"><div class="t"><i>{n:02d}</i>{e(q)}</div>{inner}</div>')
    body = f"""<h1>{e(t['guide_title'])}</h1><p class="lead">{e(t['guide_lead'])}</p>
<h2>{e(t['steps_title'])}</h2><ol class="steps">{steps}</ol>
<h2>{e(t['prep_title'])}</h2><ul class="prep">{prep}</ul>{contact(t)}
<div class="brk"></div><h2 style="font-size:17pt;margin-top:20px">{e(t['brief_title'])}</h2><p class="hint">{e(t['brief_lead'])}</p>
{''.join(qs)}<p class="foot">{e(t['brief_send'])}</p>"""
    return page(lang, t['guide_title'], body)


def render(html_text, out):
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(html_text)
        src = f.name
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    '--virtual-time-budget=8000', f'--print-to-pdf={out}', f'file://{src}'],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.unlink(src)
    print('✓', os.path.relpath(out, os.path.dirname(ROOT)))


if __name__ == '__main__':
    for lang in T:
        render(price_html(lang), os.path.join(ROOT, f'price-list-{lang}.pdf'))
        render(guide_html(lang), os.path.join(ROOT, f'website-guide-{lang}.pdf'))
