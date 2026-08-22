# План внедрения находок ponytail-audit

Источник: repo-wide аудит от 2026-08-22 (`/ponytail-audit`). Все находки — про избыточную сложность/мёртвый код, **не** про баги/безопасность/производительность.

Принцип очерёдности: сначала то, что нулевого риска (удаление мёртвого кода/файлов), затем консолидация дублей (требует аккуратности и тестов), затем точечная гигиена, и отдельно — изменения зависимостей. После **каждой** фазы: `npm run typecheck && npm test`, а для фаз 2–3 — ручная проверка в браузере (`npm run dev` + `npm run server`).

---

## Phase 0 — Безопасные удаления (риск ≈ 0)

Ничего не рефакторим, просто выпиливаем то, на что нет ссылок нигде в коде.

- [ ] Удалить 27 неиспользуемых shadcn/ui-обёрток: `src/components/ui/{accordion,alert,aspect-ratio,avatar,breadcrumb,calendar,carousel,chart,command,context-menu,drawer,form,hover-card,input-otp,menubar,navigation-menu,pagination,progress,radio-group,resizable,scroll-area,separator,sidebar,skeleton,slider,switch,use-mobile}.{ts,tsx}` (−3467 строк)
- [ ] Удалить дубликаты диалогов roadmap (Finder-копии `" 2.tsx"`): `src/components/roadmap/{AddItemDialog,ConfirmDialog,StartDateDialog,TextPromptDialog} 2.tsx` (−289 строк)
- [ ] Удалить мёртвый `RoleCellRenderer`/`RoleCell` из `src/components/ResourcePlan.tsx:104-110,142-200` (−65 строк, уже помечен как мёртвый в собственном комментарии кода)
- [ ] Удалить `test-calculation.js` из корня — дублирует покрытие `calculations.test.ts`, нигде не подключён (−50 строк)
- [ ] Удалить мёртвые exports в `src/utils/roadmap.ts:370-400` — `snapToPeriod`, `dateToPeriod` (−35 строк)
- [ ] Удалить мёртвые exports, используемые только в своих же тестах:
  - `GRAB_ZONE`, `periodAtX` — `src/utils/roadmapGeometry.ts:21,57-60`
  - `feasiblePeriods` (обёртка, реальный вызывающий код зовёт `feasiblePeriodsDetail` напрямую) — `src/utils/roadmapLoad.ts:395-402`
  - `totalDemandHours` — `src/utils/roadmapLoad.ts:342-346`
  - `fteEffort` — `src/utils/calculations.ts:101-104`
  - `CLIENT_PNG_FORBIDDEN_LABEL_FRAGMENTS` (guard, который ничего не гвардит) — `src/utils/clientViewPng.ts:59-64`
- [ ] Удалить мёртвую server-side копию `isPlaceholderSinglePhase` — `server/planner/phases.ts:66-68` (рабочая версия — в `src/utils/phases.ts:38-40`)
- [ ] Удалить неиспользуемый `AbortController`/`req.on('close', …)` на роуте генерации плана, либо (см. Phase 1) прокинуть `signal` по-настоящему — `server.ts:1169-1179`
- [ ] Удалить мусорные файлы из git: пустой `nul` и залётевший тестовый `prisma/test 2.db` (57 КБ, проскочил мимо `.gitignore`-паттерна из-за пробела перед «2»)

**Проверка Phase 0:** `npm run typecheck`, `npm test` — оба должны быть зелёными без единой правки логики.

---

## Phase 1 — Консолидация на бэкенде

- [ ] Убрать дублирование списка регионов: оставить один источник (`REGION_COLUMNS` в `server/planner/rateCard.ts:17-27`), в `server-validation.ts:156-166` импортировать его вместо повторного перечисления в `z.enum(...)`
- [ ] Заменить инлайновый `try { JSON.parse(project.phases || '[]') } catch {}` на вызов существующего `parseProjectPhases()` — `server.ts:1007-1010`
- [ ] Заменить повторяющийся `periodCount ?? weekCount ?? 0` во всех точках вызова на экспортированный `phaseLength()` — `server/planner/phases.ts:97`, `server/planner/generateResourcePlan.ts:92,133`, `server.ts:1016,1038`
- [ ] Упростить mtime-based hot-reload кэш промпт-файла — заменить `SkillCache` (со `stat`-проверкой на каждый запрос) на load-once кэш без инвалидации — `server/planner/scopingSkill.ts:48-93`

**Проверка Phase 1:** `npm run typecheck`, `npm test` (особенно `server-validation.test.ts`, `server/planner/*.test.ts`), затем вручную дернуть эндпоинт генерации плана через UI и убедиться, что суммы по фазам не разъехались.

---

## Phase 2 — Консолидация на фронтенде

Самая объёмная и самая рискованная фаза — здесь дублируется бизнес-логика (расчёты, экспорт), поэтому делать **по одному пункту**, коммит на пункт, тесты после каждого.

- [ ] Вынести общий `buildPlanFinancials(plans, phases, hrsPerPeriod, exchangeRate)` и заменить 4 независимые копии цикла расчёта (effort hours / internal cost / client cost / margin):
  `src/App.tsx:663-1025`, `src/App.tsx:1027-1314`, `src/components/ResourcePlan.tsx:~1140`, `src/components/ClientView.tsx:198-227` (≈ −250 строк)
- [ ] Вынести таблицу `REGION_FIELDS` (`{slug, field, label}[]`) и собрать 9 колонок RateCard через `.map()` вместо ручного перечисления + 9-way `switch` в `handleAddRateCard` — `src/components/RateCard.tsx:241-431,558-598` (≈ −230 строк)
- [ ] Вынести фабрику `makeFieldColumn(field, header, transform?)` для 6-кратного дублирования `onCellValueChanged` в ResourceList — `src/components/ResourceList.tsx:78-185`
- [ ] Вынести `buildPlanExcelExport()` по аналогии с уже готовым `clientViewPng.ts`, убрать дублирование форматирования Excel-отчёта — `src/App.tsx:743-1025`, `src/components/ClientView.tsx:265-431` (≈ −130 строк)
- [ ] Перенести `getAllocationBgColor` в `gridTheme.ts` (уже существующее общее место для темы грида), убрать копию — `src/components/ClientView.tsx:17-29` vs `src/components/ResourcePlan.tsx:80-92`
- [ ] Вынести `drawCells(y, height, values, columns, font, color)` и заменить тройное повторение цикла отрисовки header/body/totals — `src/utils/clientViewPng.ts:246-297` (≈ −20 строк)

**Проверка Phase 2 (обязательно руками в браузере):**
- RateCard: редактирование ставки в каждом из 9 регионов, добавление новой строки через каждый регион
- ResourceList: редактирование всех 6 полей, которые раньше дублировались
- ResourcePlan / ClientView: сверить итоговые суммы (effort/cost/margin) до и после рефакторинга на одном и том же плане
- Экспорт в Excel и в PNG на реальном проекте — сверить, что цифры и форматирование не изменились
- `npm test` (особенно `*.test.tsx` для затронутых компонентов) + `npm run typecheck`

---

## Phase 3 — Точечная гигиена

- [ ] Убрать доступ к приватному инстансу AG Grid через `document.querySelector('.ag-theme-alpine')` + `setTimeout`, использовать `onGridReady`/ref API грида — `src/components/RateCard.tsx:105-119`
- [ ] Убрать `document.execCommand('copy')` fallback, оставить только `navigator.clipboard.writeText` — `src/components/ResourcePlan.tsx:1174-1191`
- [ ] Убрать `setTimeout(() => setResourcePlans(prev => [...prev]), 100)` — состояние и так обновляется через `loadProjectData` — `src/App.tsx:730-735`
- [ ] Убрать неиспользуемые дефолтные параметры (все реальные вызовы передают оба аргумента явно) — `src/utils/calculations.ts:79,91` (`hoursPerPeriod`, `estimatedEffortHours`)

**Проверка Phase 3:** ручная проверка кнопки «copy client link», проверка ресайза колонок RateCard, импорт проекта в App (кейс, который раньше полагался на `setTimeout`).

---

## Phase 4 — Зависимости

- [ ] Удалить `better-sqlite3` из `package.json` — нигде не импортируется, Prisma использует свой движок
- [ ] Заменить `c12`-загрузку `ai.config.ts` на обычный статический/динамический импорт, удалить `defineAIConfig` (no-op identity wrapper) — `server/llm/config.ts:1,28`, `ai.config.ts`
- [ ] После Phase 0: `package.json` уже избавится от 21 неиспользуемого пакета вместе с UI-обёртками (`recharts`, `react-day-picker`, `embla-carousel-react`, `cmdk`, `react-hook-form`, `vaul`, `input-otp`, `react-resizable-panels`, 13× `@radix-ui/react-*`) — здесь просто прогнать `npm install` и закоммитить обновлённый `package-lock.json`

**Проверка Phase 4:** `rm -rf node_modules && npm install && npm run build && npm run typecheck && npm test` — полная чистая пересборка, чтобы убедиться, что ничего не тянуло удалённые пакеты транзитивно.

---

## Итог

| Фаза | Что | Риск | Оценка эффекта |
|---|---|---|---|
| 0 | Удаление мёртвых файлов/exports | нулевой | −3900 строк |
| 1 | Консолидация бэкенда | низкий | −40 строк, меньше мест для рассинхрона |
| 2 | Консолидация фронтенда | средний, нужны ручные проверки | −650 строк |
| 3 | Точечная гигиена | низкий | несколько мест устойчивее к будущим багам |
| 4 | Чистка зависимостей | низкий (после Phase 0) | −23 пакета |

Рекомендация: фазы 0 и 4 можно сделать в один заход и один PR (чисто механическое удаление). Фазы 1–3 — отдельными PR по пунктам, с прогоном тестов и, где отмечено, ручной проверкой в браузере перед мержем.
