/* =====================================================================
   Перевод сайта на польский (RU — основной язык, PL — перевод).
   • Язык: выбранный вручную (кнопка RU/PL) → иначе язык браузера (pl → польский).
   • Выбор хранится в localStorage и в cookie `lang` — по ней сервер узнаёт,
     на каком языке слать клиенту письма и сообщения в Telegram.
   • Переводится интерфейс: тексты, подсказки, кнопки, ошибки, окна confirm/alert.
     Ваши посты, описания и «Обо мне» остаются как написаны (data-i18n-skip).
   • Новый текст в интерфейсе? Добавьте пару «по-русски → по-польски» в PL ниже.
   ===================================================================== */
(function () {
  'use strict';
  var KEY = 'lang';

  function detect() {
    try { var s = localStorage.getItem(KEY); if (s === 'pl' || s === 'ru') return s; } catch (e) { /* приватный режим */ }
    var m = document.cookie.match(/(?:^|;\s*)lang=(pl|ru)\b/);
    if (m) return m[1];
    var langs = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < langs.length; i++) {
      var l = String(langs[i] || '').toLowerCase();
      if (l.indexOf('pl') === 0) return 'pl';
      if (/^(ru|uk|be)/.test(l)) return 'ru';
    }
    return 'ru';
  }
  var lang = detect();
  var root = document.documentElement;
  root.lang = lang;
  root.dataset.lang = lang;
  // cookie — для сервера (язык писем и уведомлений)
  document.cookie = 'lang=' + lang + '; path=/; max-age=31536000; samesite=lax';

  /* ---------- Словарь: точная фраза по-русски → по-польски ---------- */
  var PL = {
    // навигация и шапка
    'Блог': 'Blog', 'Файлы': 'Pliki', 'Видео': 'Wideo', 'Ссылки': 'Linki', 'Запись': 'Rezerwacja', 'Обо мне': 'O mnie',
    'Основное меню': 'Menu główne', 'Открыть меню': 'Otwórz menu', 'Закрыть меню': 'Zamknij menu',
    'Переключить тему': 'Zmień motyw', 'Перейти к содержимому': 'Przejdź do treści', 'Наверх': 'Do góry',
    'Личный кабинет': 'Moje konto', 'Войти в личный кабинет': 'Zaloguj się do konta', 'Войти': 'Zaloguj się', 'Выйти': 'Wyloguj się',
    'На главную': 'Strona główna', 'На сайт': 'Na stronę', '← На сайт': '← Na stronę', '← Весь сайт': '← Cała strona',
    'Вернуться на сайт': 'Wróć na stronę', 'Политика конфиденциальности': 'Polityka prywatności',
    'Приветствие': 'Powitanie', 'Прокрутить вниз': 'Przewiń w dół', 'загрузка': 'ładowanie',
    'Denys Savenko — личный блог': 'Denys Savenko — blog osobisty',
    'Denys Savenko — технологии, творчество, личные заметки': 'Denys Savenko — technologie, twórczość, osobiste notatki',
    'Личный блог Denys Savenko о технологиях, творчестве и жизни: посты, файлы, видео и полезные ссылки.': 'Osobisty blog Denysa Savenko o technologiach, twórczości i życiu: wpisy, pliki, wideo i przydatne linki.',
    'Технологии, творчество и личные заметки.': 'Technologie, twórczość i osobiste notatki.',
    'Технологии, творчество, личные заметки': 'Technologie, twórczość, osobiste notatki',
    'Аватар автора блога Denys Savenko': 'Awatar autora bloga Denysa Savenko', 'автор блога': 'autor bloga',
    'Читать блог': 'Czytaj bloga', 'Записаться': 'Umów się',

    // разделы
    '01 / заметки': '01 / notatki', '02 / загрузки': '02 / pliki', '03 / смотреть': '03 / do obejrzenia',
    '04 / закладки': '04 / zakładki', '05 / запись': '05 / rezerwacja', '06 / знакомство': '06 / poznajmy się',
    'Отзывы': 'Opinie', 'Соцсети': 'Media społecznościowe', 'Сайт': 'Strona',
    'Если хочется обсудить идею, предложить коллаборацию или просто сказать привет — пишите в соцсетях.': 'Chcesz omówić pomysł, zaproponować współpracę albo po prostu się przywitać? Napisz do mnie w mediach społecznościowych.',
    'Привет! Меня зовут Denys Savenko. Я пишу код, фотографирую ночные города и собираю маленькие творческие проекты. Здесь — мои заметки о технологиях, процессе и жизни.': 'Cześć! Nazywam się Denys Savenko. Piszę kod, fotografuję nocne miasta i tworzę małe projekty. Tutaj znajdziesz moje notatki o technologiach, procesie twórczym i życiu.',

    // поиск, фильтр, карточки
    'Поиск по сайту': 'Wyszukiwanie', 'Поиск по постам, файлам, видео и ссылкам': 'Szukaj we wpisach, plikach, wideo i linkach',
    'Поиск по постам, файлам, видео и ссылкам…': 'Szukaj we wpisach, plikach, wideo i linkach…',
    'Фильтр по тегам': 'Filtruj po tagach', 'Все': 'Wszystkie',
    'Постов по запросу не найдено.': 'Nie znaleziono wpisów.', 'Файлов по запросу не найдено.': 'Nie znaleziono plików.',
    'Видео по запросу не найдено.': 'Nie znaleziono wideo.', 'Ссылок по запросу не найдено.': 'Nie znaleziono linków.',
    'Ничего не найдено. Попробуйте другой запрос или тег.': 'Nic nie znaleziono. Spróbuj innego zapytania lub tagu.',
    'Читать': 'Czytaj', 'Скачать': 'Pobierz', 'Подробнее': 'Więcej', 'Показать ещё': 'Pokaż więcej', 'Закрыть': 'Zamknij',
    'Нравится': 'Lubię to', 'Убрать лайк': 'Cofnij polubienie', 'Сохранить пост': 'Zapisz wpis', 'Сохранить файл': 'Zapisz plik',
    'Убрать из сохранённого': 'Usuń z zapisanych',
    'Не удалось загрузить контент. Обновите страницу.': 'Nie udało się wczytać treści. Odśwież stronę.',
    'Контент не загрузился: при открытии файла напрямую браузер не даёт читать content/*.json. Запустите локальный сервер (см. README).': 'Treść się nie wczytała: przy otwieraniu pliku bezpośrednio przeglądarka blokuje content/*.json. Uruchom lokalny serwer (zob. README).',

    // комментарии
    'Комментарии': 'Komentarze', 'Ваш комментарий': 'Twój komentarz', 'Написать комментарий…': 'Napisz komentarz…',
    'Отправить': 'Wyślij', 'Удалить': 'Usuń', 'Удалить ваш комментарий?': 'Usunąć Twój komentarz?',
    'Пока никто не написал — будьте первым.': 'Nikt jeszcze nie napisał — bądź pierwszy.',
    'Войдите через Google, чтобы оставить комментарий.': 'Zaloguj się przez Google, aby dodać komentarz.',
    'Напишите хотя бы пару слов.': 'Napisz chociaż kilka słów.', 'только что': 'przed chwilą',
    'Не получилось. Попробуйте ещё раз.': 'Nie udało się. Spróbuj ponownie.',
    'Оценка': 'Ocena', 'Клиент': 'Klient',

    // QR
    'QR-код для записи с телефона': 'Kod QR do rezerwacji z telefonu', 'QR-код на форму записи': 'Kod QR do formularza rezerwacji',
    'Записаться с телефона': 'Umów się z telefonu', 'Запись с телефона': 'Rezerwacja z telefonu',
    'Наведите камеру — сразу откроется форма записи.': 'Skieruj aparat — od razu otworzy się formularz rezerwacji.',

    // форма записи
    'Выберите услугу и удобное время. Я получу заявку и свяжусь с вами, чтобы всё подтвердить.': 'Wybierz usługę i dogodny termin. Otrzymam zgłoszenie i skontaktuję się, aby wszystko potwierdzić.',
    'Выберите услугу': 'Wybierz usługę', 'Укажите дату и время': 'Podaj datę i godzinę', 'Оставьте контакты': 'Zostaw kontakt',
    'Услуга': 'Usługa', 'Дата': 'Data', 'Время': 'Godzina', 'Имя': 'Imię', 'Телефон': 'Telefon', 'Почта': 'E-mail',
    'Комментарий': 'Komentarz', '— необязательно': '— opcjonalnie', 'Комментарий — необязательно': 'Komentarz — opcjonalnie',
    'Как к вам обращаться': 'Jak się do Ciebie zwracać', 'Код страны': 'Kod kraju',
    'Коротко о задаче, ссылки, пожелания': 'Krótko o zadaniu, linki, życzenia', 'Коротко о задаче': 'Krótko o zadaniu',
    'Данные нужны только чтобы связаться с вами по заявке.': 'Dane są potrzebne tylko do kontaktu w sprawie zgłoszenia.',
    'Отправить заявку': 'Wyślij zgłoszenie', 'Отправляю…': 'Wysyłam…', 'Заявка отправлена': 'Zgłoszenie wysłane',
    'Выберите время': 'Wybierz godzinę', 'Выберите дату': 'Wybierz datę', 'Сначала дата': 'Najpierw data',
    'Сначала выберите дату': 'Najpierw wybierz datę', 'Свободного времени нет': 'Brak wolnych terminów',
    'На эту дату всё занято': 'Ten dzień jest w pełni zajęty', 'Занято': 'Zajęte', 'Выходной': 'Dzień wolny', 'Отпуск': 'Urlop',
    'Эта дата недоступна': 'Ta data jest niedostępna', 'Напишите имя': 'Wpisz imię',
    'Напишите номер телефона': 'Wpisz numer telefonu', 'Проверьте номер телефона': 'Sprawdź numer telefonu',
    'Проверьте почту': 'Sprawdź adres e-mail', 'Проверьте отмеченные поля.': 'Sprawdź zaznaczone pola.',
    'Это время уже заняли': 'Ten termin jest już zajęty',
    'Это время только что заняли. Выберите другое.': 'Ten termin został właśnie zajęty. Wybierz inny.',
    'Не получилось отправить заявку.': 'Nie udało się wysłać zgłoszenia.',
    'Подтверждение отправлено на почту. Если планы поменяются, запись можно': 'Potwierdzenie wysłaliśmy na e-mail. Jeśli plany się zmienią, wizytę można',
    'перенести или отменить': 'przełożyć lub odwołać', 'Статус:': 'Status:',
    'ждёт подтверждения': 'czeka na potwierdzenie', 'ожидает подтверждения': 'czeka na potwierdzenie',
    'подтверждено': 'potwierdzona', 'подтверждено ✓': 'potwierdzona ✓', 'подтверждена': 'potwierdzona', 'отменена': 'odwołana',
    // услуги по умолчанию и страны
    'Создание сайта': 'Tworzenie strony', 'Монтаж видео': 'Montaż wideo', 'Дизайн': 'Projektowanie', 'Консультация': 'Konsultacja', 'Другое': 'Inne',
    'Польша': 'Polska', 'Украина': 'Ukraina', 'Австрия': 'Austria', 'Армения': 'Armenia', 'Беларусь': 'Białoruś',
    'Великобритания': 'Wielka Brytania', 'Германия': 'Niemcy', 'Грузия': 'Gruzja', 'Ирландия': 'Irlandia', 'Испания': 'Hiszpania',
    'Италия': 'Włochy', 'Казахстан': 'Kazachstan', 'Латвия': 'Łotwa', 'Литва': 'Litwa', 'Молдова': 'Mołdawia',
    'Нидерланды': 'Holandia', 'Норвегия': 'Norwegia', 'Португалия': 'Portugalia', 'Россия': 'Rosja', 'Словакия': 'Słowacja',
    'США / Канада': 'USA / Kanada', 'Турция': 'Turcja', 'Франция': 'Francja', 'Чехия': 'Czechy', 'Швеция': 'Szwecja', 'Эстония': 'Estonia',

    // кабинет
    'Разделы кабинета': 'Sekcje konta', 'Записи': 'Wizyty', 'Новая запись': 'Nowa wizyta', 'История': 'Historia',
    'Сохранённое': 'Zapisane', 'Активность': 'Aktywność', 'Профиль': 'Profil',
    'Мои записи': 'Moje wizyty', 'Будущие визиты. Статус обновляется сам.': 'Nadchodzące wizyty. Status aktualizuje się sam.',
    'Будущих записей нет.': 'Brak nadchodzących wizyt.', 'Перенести': 'Przełóż', 'Отменить': 'Odwołaj',
    'Отменить запись': 'Odwołaj wizytę', 'Выбрать другое время': 'Wybierz inny termin', 'Скрыть': 'Ukryj',
    'Перенести на это время': 'Przełóż na ten termin', 'Записаться на это время': 'Umów się na ten termin',
    'Записаться снова': 'Umów się ponownie', 'Новая дата': 'Nowa data', 'Выбрать': 'Wybierz', 'Выберите': 'Wybierz',
    'Загружаю…': 'Wczytuję…', 'Переношу…': 'Przekładam…', 'Отменяю…': 'Odwołuję…', 'Записываю…': 'Rezerwuję…',
    'Вхожу…': 'Loguję…', 'Сохраняю…': 'Zapisuję…', 'Запись отменена': 'Wizyta odwołana',
    'Запись отменена. Письмо с подтверждением отправлено.': 'Wizyta odwołana. Wysłaliśmy e-mail z potwierdzeniem.',
    'отменена вами': 'odwołana przez Ciebie', 'мастер': 'wykonawca',
    'Анкету заполнять не нужно — данные берутся из профиля.': 'Nie trzeba wypełniać formularza — dane pobieramy z profilu.',
    'Записываем:': 'Rezerwujemy dla:', 'изменить': 'zmień', 'телефон не указан': 'brak telefonu',
    'Осталось выбрать:': 'Zostało wybrać:', 'услугу': 'usługę', 'дату': 'datę', 'время': 'godzinę',
    'История визитов': 'Historia wizyt', 'Прошедших визитов пока нет.': 'Nie masz jeszcze zakończonych wizyt.',
    'Прошедшие записи за 2,5 месяца и отменённые — за 2 месяца.': 'Zakończone wizyty z 2,5 miesiąca i odwołane — z 2 miesięcy.',
    'Оставить отзыв': 'Dodaj opinię', 'Отправить отзыв': 'Wyślij opinię',
    'Как всё прошло? Отзыв появится на сайте после проверки.': 'Jak było? Opinia pojawi się na stronie po weryfikacji.',
    'Спасибо! Отзыв опубликован': 'Dziękuję! Opinia opublikowana', 'Спасибо! Отзыв появится после проверки': 'Dziękuję! Opinia pojawi się po weryfikacji',
    'на проверке': 'w weryfikacji', 'опубликован': 'opublikowana',
    'Посты и файлы, отмеченные ☆ на сайте.': 'Wpisy i pliki oznaczone ☆ na stronie.', 'Пока ничего не сохранено.': 'Nic jeszcze nie zapisano.',
    'Нажмите ☆ на посте или файле на сайте.': 'Kliknij ☆ przy wpisie lub pliku na stronie.', 'Пост': 'Wpis', 'Файл': 'Plik',
    'Открыть': 'Otwórz', 'Убрать': 'Usuń',
    'Ваши комментарии и понравившиеся посты.': 'Twoje komentarze i polubione wpisy.', 'Вы ещё не комментировали.': 'Nie dodano jeszcze komentarzy.',
    'Лайки, поставленные после входа в кабинет, появятся здесь.': 'Tutaj pojawią się polubienia dodane po zalogowaniu.',
    'Эти данные подставляются в запись.': 'Te dane trafiają do rezerwacji.', 'Контакты': 'Kontakt', 'Сохранить': 'Zapisz',
    'Данные сохранены': 'Dane zapisane', '✓ Сохранено': '✓ Zapisano',
    '✓ Данные сохранены — они подставятся в следующую запись.': '✓ Dane zapisane — zostaną użyte przy następnej rezerwacji.',
    'Уведомления в Telegram': 'Powiadomienia w Telegramie', 'Не подключён': 'Nie połączono', 'Подключён': 'Połączono',
    'Подключить Telegram': 'Połącz Telegram', 'Отключить': 'Odłącz', 'Telegram отключён': 'Telegram odłączony', 'Telegram подключён ✓': 'Telegram połączony ✓',
    'Подключите, чтобы получать напоминания за час до визита и подтверждения записей.': 'Połącz, aby otrzymywać przypomnienia godzinę przed wizytą i potwierdzenia rezerwacji.',
    'Подтверждения, переносы и напоминания — накануне и за час до визита.': 'Potwierdzenia, zmiany terminów i przypomnienia — dzień wcześniej i godzinę przed wizytą.',
    'Нажмите «Start» в Telegram — подключение займёт секунду': 'Naciśnij «Start» w Telegramie — połączenie zajmie sekundę',
    'Удалить мои данные': 'Usuń moje dane', 'Удалить всё': 'Usuń wszystko', 'УДАЛИТЬ': 'USUŃ',
    'Будущие записи отменятся, а профиль, история, комментарии, отзывы, сохранённое и привязка Telegram удалятся навсегда.': 'Nadchodzące wizyty zostaną odwołane, a profil, historia, komentarze, opinie, zapisane elementy i połączenie z Telegramem zostaną usunięte na zawsze.',
    'Это нельзя отменить. Чтобы удалить все данные, напишите слово УДАЛИТЬ': 'Tego nie da się cofnąć. Aby usunąć wszystkie dane, wpisz słowo USUŃ',
    'Удаление отменено': 'Usuwanie anulowane', 'Все ваши данные удалены': 'Wszystkie Twoje dane zostały usunięte',
    'Войдите через Google, чтобы управлять записями.': 'Zaloguj się przez Google, aby zarządzać wizytami.',
    'Войдите через Google, чтобы видеть свои записи, переносить и отменять их в пару кликов.': 'Zaloguj się przez Google, aby widzieć swoje wizyty, przekładać je i odwoływać w kilka kliknięć.',
    'Сайт получит только имя, почту и фото профиля.': 'Strona otrzyma tylko imię, e-mail i zdjęcie profilowe.',
    'Сайт получит только ваше имя, почту и фото профиля — без доступа к письмам и файлам.': 'Strona otrzyma tylko Twoje imię, e-mail i zdjęcie profilowe — bez dostępu do wiadomości i plików.',
    'записи, перенос и отмена в пару кликов;': 'rezerwacje, zmiany i odwołania w kilka kliknięć;',
    'напоминания в Telegram за час до визита;': 'przypomnienia w Telegramie godzinę przed wizytą;',
    'запись без анкеты и история визитов;': 'rezerwacja bez formularza i historia wizyt;',
    'сохранённые посты и файлы.': 'zapisane wpisy i pliki.',
    'Вход пока не настроен.': 'Logowanie nie jest jeszcze skonfigurowane.', 'Не удалось загрузить вход Google.': 'Nie udało się wczytać logowania Google.',
    'Ошибка сети. Попробуйте ещё раз.': 'Błąd sieci. Spróbuj ponownie.', 'Вы отменили эту запись': 'Odwołano tę wizytę',
    'Понравилось ·': 'Polubione ·', 'Комментарии ·': 'Komentarze ·', '♥ лайк': '♥ polubienie', 'к посту «': 'do wpisu «',

    // страница записи по ссылке из письма
    'Ваша запись': 'Twoja wizyta', 'Загружаю запись…': 'Wczytuję wizytę…', 'Запись не найдена': 'Nie znaleziono wizyty',
    'Ссылка неполная': 'Niepełny link', 'Откройте ссылку из письма целиком.': 'Otwórz cały link z wiadomości e-mail.',
    'Не получилось открыть': 'Nie udało się otworzyć', 'Эта запись уже прошла.': 'Ta wizyta już się odbyła.',
    'Отменить запись? Время освободится для других.': 'Odwołać wizytę? Termin zwolni się dla innych.',
    'Спасибо, что предупредили! Если захотите — запишитесь снова на сайте.': 'Dziękuję za informację! Jeśli zechcesz — umów się ponownie na stronie.',
    'Эту запись отменили. Подробности — в письме на вашей почте. Записаться снова можно на сайте.': 'Ta wizyta została odwołana. Szczegóły znajdziesz w wiadomości e-mail. Ponownie umówisz się na stronie.',
    'К сожалению, эту запись пришлось отменить — приношу извинения': 'Niestety musiałem odwołać tę wizytę — przepraszam',
    'можно перенести или отменить запись.': 'możesz przełożyć lub odwołać wizytę.',

    // ошибки сервера
    'База не подключена.': 'Baza danych nie jest podłączona.', 'Войдите через Google, чтобы комментировать.': 'Zaloguj się przez Google, aby komentować.',
    'Войдите через Google.': 'Zaloguj się przez Google.', 'Войдите, чтобы управлять записями.': 'Zaloguj się, aby zarządzać wizytami.',
    'Вход через Google пока не настроен.': 'Logowanie przez Google nie jest jeszcze skonfigurowane.',
    'Выберите время.': 'Wybierz godzinę.', 'Выберите дату и время.': 'Wybierz datę i godzinę.', 'Выберите дату.': 'Wybierz datę.',
    'Выберите услугу.': 'Wybierz usługę.', 'Добавьте телефон в профиле — он нужен для связи.': 'Dodaj telefon w profilu — jest potrzebny do kontaktu.',
    'Запись временно не работает.': 'Rezerwacje chwilowo nie działają.',
    'Запись не найдена — возможно, она уже отменена или перенесена.': 'Nie znaleziono wizyty — możliwe, że została już odwołana lub przełożona.',
    'Запись не найдена — возможно, она уже отменена.': 'Nie znaleziono wizyty — możliwe, że została już odwołana.',
    'Запись не найдена.': 'Nie znaleziono wizyty.', 'Запись уже отменена.': 'Wizyta jest już odwołana.',
    'Комментарии пока выключены.': 'Komentarze są na razie wyłączone.', 'Комментарий не найден.': 'Nie znaleziono komentarza.',
    'Комментарий уже удалён.': 'Komentarz został już usunięty.', 'Напишите имя.': 'Wpisz imię.',
    'Напишите пару слов о визите.': 'Napisz kilka słów o wizycie.', 'Не получилось войти. Попробуйте ещё раз.': 'Nie udało się zalogować. Spróbuj ponownie.',
    'Отзыв можно оставить только о прошедшей записи.': 'Opinię można dodać tylko po odbytej wizycie.', 'Отзыв об этой записи уже есть.': 'Opinia o tej wizycie już istnieje.',
    'Под этим постом уже слишком много комментариев.': 'Pod tym wpisem jest już za dużo komentarzy.', 'Подтвердите удаление.': 'Potwierdź usunięcie.',
    'Пост не найден.': 'Nie znaleziono wpisu.', 'Поставьте оценку от 1 до 5.': 'Wystaw ocenę od 1 do 5.',
    'Проверьте номер телефона.': 'Sprawdź numer telefonu.', 'Проверьте почту.': 'Sprawdź adres e-mail.',
    'Сервис временно недоступен.': 'Usługa chwilowo niedostępna.',
    'Слишком много заявок подряд. Попробуйте через несколько минут.': 'Za dużo zgłoszeń z rzędu. Spróbuj za kilka minut.',
    'Слишком много комментариев подряд. Попробуйте чуть позже.': 'Za dużo komentarzy z rzędu. Spróbuj trochę później.',
    'Слишком часто. Попробуйте чуть позже.': 'Zbyt często. Spróbuj trochę później.', 'Ссылка недействительна.': 'Link jest nieważny.',
    'Что-то пошло не так. Попробуйте ещё раз.': 'Coś poszło nie tak. Spróbuj ponownie.', 'Эта дата недоступна.': 'Ta data jest niedostępna.',
    'Эта запись уже отменена.': 'Ta wizyta jest już odwołana.', 'Это время недоступно.': 'Ten termin jest niedostępny.',
    'Это время уже заняли. Выберите другое.': 'Ten termin jest już zajęty. Wybierz inny.', 'Это время уже занято.': 'Ten termin jest już zajęty.',
    'Это время уже прошло.': 'Ten termin już minął.', 'Это и так ваше текущее время.': 'To jest już Twój obecny termin.',
    'Метод не поддерживается.': 'Metoda nieobsługiwana.'
  };

  /* ---------- Фразы с подстановками (даты, числа, имена) ---------- */
  var PATTERNS = [
    [/^Показать ещё (\d+) из (\d+)$/, 'Pokaż jeszcze $1 z $2'],
    [/^([\d,]+) (КБ|МБ)$/, function (m, n, u) { return n + (u === 'КБ' ? ' KB' : ' MB'); }],
    [/^(\S+) (.+) (\+\d+)$/, function (m, f, name, code) { return f + ' ' + tr1(name) + ' ' + code; }],
    [/^Найдено (\d+) — (.+)$/, function (m, n, rest) { return 'Znaleziono ' + n + ' — ' + rest.replace(/постов/g, 'wpisów').replace(/файлов/g, 'plików').replace(/видео/g, 'wideo').replace(/ссылок/g, 'linków'); }],
    [/^(\d+) мин назад$/, '$1 min temu'], [/^(\d+) ч назад$/, '$1 godz. temu'],
    [/^(\d+) (комментарий|комментария|комментариев)$/, function (m, n) { return n + ' ' + plPlural(+n, ['komentarz', 'komentarze', 'komentarzy']); }],
    [/^Оценка (\d) из 5$/, 'Ocena $1 z 5'],
    [/^Комментарии · (\d+)$/, 'Komentarze · $1'], [/^Понравилось · (\d+)$/, 'Polubione · $1'],
    [/^(.+) ·$/, function (m, a) { return tr1(a) + ' ·'; }],
    [/^Читать пост: (.+)$/, 'Czytaj wpis: $1'], [/^Смотреть видео: (.+)$/, 'Obejrzyj wideo: $1'],
    [/^Превью видео «(.+)»$/, 'Miniatura wideo „$1”'], [/^Фото: (.+)$/, 'Zdjęcie: $1'],
    [/^Личный кабинет: (.+)$/, 'Moje konto: $1'], [/^(.+) — личный блог$/, '$1 — blog osobisty'],
    [/^(.+) — записи нет$/, '$1 — brak rezerwacji'], [/^(.+) — в этот день записи нет$/, '$1 — tego dnia brak rezerwacji'],
    [/^(.+): в этот день записи нет, выберите другую дату\.$/, '$1: tego dnia nie ma rezerwacji, wybierz inną datę.'],
    [/^(.+) — прошло$/, '$1 — minęło'], [/^(.+) — занято$/, '$1 — zajęte'],
    [/^(.*)\. Я свяжусь с вами по телефону или почте, чтобы подтвердить время\.$/, function (m, a) { return a.split(' · ').map(tr1).join(' · ') + '. Skontaktuję się telefonicznie lub mailowo, aby potwierdzić termin.'; }],
    [/^(.+) Можно написать мне в Instagram\.$/, '$1 Możesz też napisać do mnie na Instagramie.'],
    [/^Отменить запись на (.+)\? Время освободится для других\.$/, 'Odwołać wizytę $1? Termin zwolni się dla innych.'],
    [/^Отменить запись на (.+)\?$/, 'Odwołać wizytę $1?'],
    [/^Вы записаны: (.+)$/, 'Zarezerwowano: $1'], [/^Готово: (.+)$/, 'Gotowe: $1'],
    [/^Готово! Вы записаны на (.+)\. Скоро подтвержу\.$/, 'Gotowe! Zarezerwowano termin $1. Wkrótce potwierdzę.'],
    [/^Готово! Новое время: (.+)\.$/, 'Gotowe! Nowy termin: $1.'],
    [/^✅ Запись на (.+) подтверждена$/, '✅ Wizyta $1 potwierdzona'],
    [/^Запись на (.+) отменена — приношу извинения\. Выберите другое время ниже\.$/, 'Wizyta $1 została odwołana — przepraszam. Wybierz inny termin poniżej.'],
    [/^Осталось выбрать: (.+)$/, function (m, list) { return 'Zostało wybrać: ' + list.split(', ').map(tr1).join(', '); }],
    [/^Выберите (.+)\.$/, function (m, list) { return 'Wybierz ' + list.split(', ').map(tr1).join(', ') + '.'; }],
    [/^отменил (.+)$/, 'odwołał $1'],
    [/^Эту запись отменил (.+?)( \(.+\))? — приношу извинения\.( Выберите другое время: ваши данные сохранены\.)?$/, function (m, who, when, more) {
      return 'Tę wizytę odwołał ' + who + (when || '') + ' — przepraszam.' + (more ? ' Wybierz inny termin: Twoje dane są zapisane.' : ''); }],
    [/^Вы отменили эту запись( \(.+\))?\. Если планы изменились — запишитесь снова\.$/, 'Odwołano tę wizytę$1. Jeśli plany się zmieniły — umów się ponownie.'],
    [/^Почта — из Google: (.+)\. Телефон — с кодом страны\.$/, 'E-mail — z Google: $1. Telefon — z kierunkowym kraju.'],
    [/^Здесь видны записи, оставленные на почту (.+)\.$/, 'Tutaj widać wizyty zarezerwowane na adres $1.'],
    [/^(.+) · Telegram подключён$/, '$1 · Telegram połączony'],
    [/^ · ваш отзыв: (.*)$/, ' · Twoja opinia: $1'],
    [/^Посетители сайта увидят: «(.+)»$/, 'Odwiedzający zobaczą: «$1»']
  ];

  function plPlural(n, f) {
    if (n === 1) return f[0];
    var a = n % 10, b = n % 100;
    return a >= 2 && a <= 4 && (b < 12 || b > 14) ? f[1] : f[2];
  }
  // одна фраза: точное совпадение → шаблон → без изменений
  function tr1(s) {
    if (Object.prototype.hasOwnProperty.call(PL, s)) return PL[s];
    for (var i = 0; i < PATTERNS.length; i++) {
      var p = PATTERNS[i];
      if (p[0].test(s)) return s.replace(p[0], typeof p[1] === 'function' ? p[1] : p[1]);
    }
    return s;
  }
  // с сохранением пробелов по краям
  function translate(text) {
    if (lang !== 'pl' || !text || !/[А-Яа-яЁё]/.test(text)) return text;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    var core = m[2].replace(/\s+/g, ' ');
    var out = tr1(core);
    return out === core ? text : m[1] + out + m[3];
  }
  // для кода: t('Фраза') или t('… {n} …', {n: 5})
  function t(s, vars) {
    var out = lang === 'pl' ? tr1(s) : s;
    if (vars) out = out.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ''; });
    return out;
  }

  /* ---------- Перевод страницы на лету ---------- */
  var SKIP = '[data-i18n-skip], script, style, textarea, code, pre'; // текст внутри не трогаем
  var SKIP_ATTR = '[data-i18n-skip]';                                // а подсказки (placeholder) у полей переводим
  var ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  function translateNode(node) {
    if (node.nodeType === 3) {
      var p = node.parentElement;
      if (!p || p.closest(SKIP)) return;
      var v = translate(node.nodeValue);
      if (v !== node.nodeValue) node.nodeValue = v;
      return;
    }
    if (node.nodeType !== 1 || node.closest(SKIP_ATTR + ', script, style')) return;
    translateAttrs(node);
    node.querySelectorAll('[placeholder], [aria-label], [title], [alt]').forEach(function (el) { if (!el.closest(SKIP_ATTR)) translateAttrs(el); });
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    var n; while ((n = w.nextNode())) translateNode(n);
  }
  function translateAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = el.getAttribute(ATTRS[i]);
      if (a) { var v = translate(a); if (v !== a) el.setAttribute(ATTRS[i], v); }
    }
  }
  function translateHead() {
    var tt = translate(document.title); if (tt !== document.title) document.title = tt;
    document.querySelectorAll('meta[name="description"], meta[property="og:title"], meta[property="og:description"]').forEach(function (m) {
      var c = m.getAttribute('content'); var v = translate(c); if (v !== c) m.setAttribute('content', v);
    });
  }

  if (lang === 'pl') {
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === 'characterData') translateNode(r.target);
        else if (r.type === 'attributes') { if (!r.target.closest(SKIP_ATTR)) translateAttrs(r.target); }
        else r.addedNodes.forEach(translateNode);
      }
      translateHead();
    }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    document.addEventListener('DOMContentLoaded', function () { translateNode(document.body); translateHead(); });
    // окна браузера (подтверждение, сообщение, ввод)
    var oc = window.confirm, oa = window.alert, op = window.prompt;
    window.confirm = function (m) { return oc.call(window, translate(String(m))); };
    window.alert = function (m) { return oa.call(window, translate(String(m))); };
    window.prompt = function (m, d) { return op.call(window, translate(String(m)), d); };
  }

  /* ---------- Переключатель RU / PL ---------- */
  function setLang(l) {
    try { localStorage.setItem(KEY, l); } catch (e) { /* ничего */ }
    document.cookie = 'lang=' + l + '; path=/; max-age=31536000; samesite=lax';
    location.reload();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lang-toggle]');
    if (b) { e.preventDefault(); setLang(lang === 'pl' ? 'ru' : 'pl'); }
  });
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
      b.textContent = lang === 'pl' ? 'RU' : 'PL';
      b.setAttribute('aria-label', lang === 'pl' ? 'Przełącz na rosyjski' : 'Переключить на польский');
      b.title = b.getAttribute('aria-label');
    });
  });

  window.I18N = { lang: lang, locale: lang === 'pl' ? 'pl-PL' : 'ru-RU', t: t, translate: translate, set: setLang };
})();
