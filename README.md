# HOI-Lite (Node.js)
Лёгкая стратегия в духе HOI4: страны, экономика, армия, войны, админка, логи и Telegram-уведомления.

## Запуск локально
```bash
npm install
npm start
# открой http://localhost:3000
```

## Деплой на Render
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment Variables (опционально):**
  - `JWT_SECRET` — секрет для токенов (обязательно на проде)
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — для логов в Telegram
  - `PORT` — не указывать вручную (Render сам задаёт)

## Роли и вход
- Регистрируешься (роль по умолчанию `player`).
- Чтобы стать админом: в файле `data/users.json` у пользователя выставь `"role": "admin"` и перезапусти.
- Админка в UI открывается кнопкой "(А) Панель админа".

## SVG-карта
- Кликабельные страны — элементы с `id="c-<ID>"` или `data-country-id="<ID>"` в `public/img/map.svg`.
- Страны и их статы хранятся в `data/countries.json`.

## Тик экономики
- Раз в час добавляются очки = уровню экономики каждой страны.
- Можно форсировать GET `/cron/tick`.

## Важно
- Хранение в JSON сделано для простоты. Для продакшена переходи на БД (Postgres/SQLite).
