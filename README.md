# Живая сетка плей-офф ЧМ-2026

Готовый статический сайт: красивая сетка плей-офф, автообновление данных, кнопка скачивания PNG.

## Что внутри

- `index.html` — страница сайта.
- `assets/styles.css` — оформление.
- `assets/app.js` — логика сетки, автообновление и скачивание PNG.
- `data/matches.json` — данные матчей.
- `scripts/update-api-football.mjs` — обновление данных через API-Football.
- `.github/workflows/update-worldcup.yml` — автоматическое обновление через GitHub Actions каждые 10 минут.

## Быстрый запуск на компьютере

```bash
python -m http.server 8080
```

Потом откройте: `http://localhost:8080`

## Как выложить онлайн через GitHub Pages

1. Создайте новый репозиторий на GitHub, например `worldcup-live-bracket`.
2. Загрузите все файлы из этого архива в репозиторий.
3. Откройте `Settings` → `Pages`.
4. В `Build and deployment` выберите `Deploy from a branch`.
5. Выберите ветку `main` и папку `/root`, нажмите `Save`.
6. Через пару минут сайт будет доступен по ссылке GitHub Pages.

## Как включить автообновление через API

1. Зарегистрируйтесь в API-Football / API-Sports и получите API key.
2. В репозитории откройте `Settings` → `Secrets and variables` → `Actions`.
3. Создайте secret с именем `APIFOOTBALL_KEY`.
4. Откройте вкладку `Actions`, выберите workflow `Update World Cup bracket data`, нажмите `Run workflow`.
5. Дальше данные будут обновляться автоматически по расписанию.

## Важно

API-ключ нельзя вставлять прямо в `app.js` или `index.html`, потому что эти файлы публичные. Поэтому обновление идёт через GitHub Actions, а сайт читает уже готовый безопасный JSON.
