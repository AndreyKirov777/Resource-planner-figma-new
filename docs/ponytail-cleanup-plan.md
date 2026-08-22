# План внедрения находок ponytail-audit

Источник: repo-wide аудит от 2026-08-22 (`/ponytail-audit`), выверен по коду 2026-08-22. Все находки — про избыточную сложность/мёртвый код, **не** про баги/безопасность/производительность.

Принцип очерёдности: сначала то, что нулевого риска (удаление мёртвого кода/файлов), затем консолидация дублей (требует аккуратности и тестов), затем точечная гигиена, и отдельно — изменения зависимостей. После **каждой** фазы: `npm run typecheck && npm test`, а для фаз 2–3 — ручная проверка в браузере (`npm run dev` + `npm run server`).

**Ветка:** cleanup делать веткой **от `feat/wbs-schedule-gantt`** (149 коммитов впереди `main`; в `main` нет roadmap-файлов, поэтому ветка от `main` не увидит roadmap-дубликаты и мёртвые roadmap-exports).

**Машинная проверка:** до Phase 0 и после Phase 4 прогнать `npx knip` (без установки) — подтверждает список неиспользуемых файлов/exports/deps независимо от аудита. Всё, что knip найдёт сверх этого списка, — в отдельный коммит, не в этот план.

---

## Phase 0 — Безопасные удаления (риск ≈ 0)

Ничего не рефакторим, просто выпиливаем то, на что нет ссылок нигде в коде.

- [x] Удалить 27 неиспользуемых shadcn/ui-обёрток: `src/components/ui/{accordion,alert,aspect-ratio,avatar,breadcrumb,calendar,carousel,chart,command,context-menu,drawer,form,hover-card,input-otp,menubar,navigation-menu,pagination,progress,radio-group,resizable,scroll-area,separator,sidebar,skeleton,slider,switch,use-mobile}.{ts,tsx}` (−3467 строк). Остаются 20 реально используемых (button, input, label, select, dialog, textarea, dropdown-menu, card, toggle-group, table, collapsible, tabs, checkbox, alert-dialog, tooltip, sonner, sheet, popover, badge, utils + toggle, который тянет toggle-group).
- [x] Удалить Finder-дубликаты (`" 2.*"`), залётевшие в git:
  - `src/components/roadmap/{AddItemDialog,ConfirmDialog,StartDateDialog,TextPromptDialog} 2.tsx` (−289 строк)
  - `.app 2.pids`
  - `_bmad/bmm/config 2.yaml`, `_bmad/core/config 2.yaml`, `_bmad/core/module-help 2.csv`, `_bmad/tea/config 2.yaml`, `_bmad/tea/module-help 2.csv`
  - `_bmad/scripts/{memlog,resolve_config,resolve_customization} 2.py`
  - пустой `nul`
  - `prisma/test 2.db` (57 КБ; не попал под `prisma/test.db*` из-за пробела перед «2»)
  - добавить в `.gitignore` строку `* 2.*`, чтобы Finder-копии больше не возвращались
- [x] Удалить мёртвый `RoleCellRenderer`/`RoleCell` из `src/components/ResourcePlan.tsx:104-110,142-200` (−65 строк, уже помечен как мёртвый в собственном комментарии кода). Поправить комментарий в `src/components/Wbs.tsx:146`, который на него ссылается.
- [x] Удалить `test-calculation.js` из корня — дублирует покрытие `calculations.test.ts`, нигде не подключён (−50 строк)
- [x] Удалить мёртвые exports **вместе с их тестами** (ссылки только из собственных `*.test.ts`):
  - `snapToPeriod`, `dateToPeriod` — `src/utils/roadmap.ts:370-400` (+ кейсы в `roadmap.test.ts`). Раунд-трип тест `periodToDate` (используется в проде) держался на `dateToPeriod` как обратной функции — вместо удаления теста инлайнили приватный тестовый хелпер `dateToPeriod` прямо в `roadmap.test.ts`, чтобы не терять покрытие `periodToDate`.
  - `GRAB_ZONE`, `periodAtX` — `src/utils/roadmapGeometry.ts:21,57-60` (+ `roadmapGeometry.test.ts`). Та же ситуация с `periodX`/`periodAtX` — `periodAtX` инлайнен как приватный тестовый хелпер в `roadmapGeometry.test.ts`.
  - `feasiblePeriods` (обёртка, реальный вызывающий код зовёт `feasiblePeriodsDetail` напрямую) — `src/utils/roadmapLoad.ts:395-402` (+ `roadmapLoad.test.ts`). Тесты остаточного снабжения (decision 1) переведены на прямой вызов `feasiblePeriodsDetail(...).periods` вместо удаления — они проверяли реальную логику, а не только обёртку.
  - `totalDemandHours` — `src/utils/roadmapLoad.ts:342-346` (+ `roadmapLoad.test.ts`). Два инварианта (empty project, WBS-3 total) использовали её как удобную сумму — инлайнили локальный хелпер `totalDemand()` в тесте вместо удаления самих проверок.
  - `fteEffort` — `src/utils/calculations.ts:101-104` (+ `calculations.test.ts`) — удалено целиком, тест был только про саму функцию.
  - `CLIENT_PNG_FORBIDDEN_LABEL_FRAGMENTS` (guard, который ничего не гвардит) — `src/utils/clientViewPng.ts:59-64` (+ `ClientView.test.tsx`). Список фрагментов инлайнен как локальная константа в тесте — сама проверка «клиентский PNG не содержит внутренних меток» осталась.
  - Roadmap-exports (`snapToPeriod`/`dateToPeriod`/`GRAB_ZONE`/`periodAtX`) сделаны в отдельных правках файлов (не отдельным git-коммитом — коммит по этому плану не создавался, см. итоговое сообщение).
- [x] Удалить мёртвую server-side копию `isPlaceholderSinglePhase` — `server/planner/phases.ts:66-68` (рабочая версия — в `src/utils/phases.ts:38-40`)
- [x] **Прокинуть** (не удалять) `AbortSignal` на роуте генерации плана — `server.ts:1169-1179`: `ac.signal` сейчас никуда не передаётся, но `server/llm/index.ts:12` уже принимает `signal?: AbortSignal`. ~3 строки: параметр `signal` в `generateResourcePlan` → в вызов LLM. Отменяет LLM-запрос при отвале клиента — экономия токенов.

**Проверка Phase 0:** `npm run typecheck`, `npm test` — оба зелёные (typecheck чистый; тесты 716/728 passed, 12 failed — все 12 падают уже на чистом дереве до этих изменений: `window.localStorage.clear is not a function` в `Wbs.roadmap.test.tsx` и `wbsColumns.test.ts`, окружение, не связано с этим планом). Разница в числе тестов (730→728) — намеренное удаление тест-кейсов, специфичных только для удалённой обёртки (`fteEffort`, лишний edge-case `periodAtX`).

---

## Phase 1 — Консолидация на бэкенде

- [x] Убрать дублирование списка регионов: оставить один источник (`REGION_COLUMNS` в `server/planner/rateCard.ts:17-27`), в `server-validation.ts:156-166` импортировать его и делать `z.enum(REGION_COLUMNS)` вместо повторного перечисления (списки идентичны, проверено)
- [x] Заменить инлайновый `try { JSON.parse(project.phases || '[]') } catch {}` на вызов существующего `parseProjectPhases()` — `server.ts:1007-1010`
- [x] Добавить в `server/planner/phases.ts` 3-строчный `export function phaseLength(p) { return p.periodCount ?? p.weekCount ?? 0 }` (на сервере его сейчас **нет** — есть только неэкспортированный клиентский в `src/utils/phases.ts:80`) и заменить повторяющийся `periodCount ?? weekCount ?? 0` во всех точках: `server/planner/phases.ts:97`, `server/planner/generateResourcePlan.ts:92,133`, `server.ts:1016,1038`

~~Упростить mtime-based hot-reload кэш промпт-файла (`SkillCache`, `server/planner/scopingSkill.ts:48-93`)~~ — **не делать**: один `stat()` на запрос ничего не стоит, а hot-reload `SKILL.md` без рестарта сервера полезен при тюнинге промпта. −8 строк ценой потери фичи.

**Проверка Phase 1:** `npm run typecheck`, `npm test` — зелёные (те же 12 pre-existing localStorage-failures, не отсюда). Ручная проверка через живой `npm run server` вместо UI (быстрее, без риска для реальных данных): создал одноразовый тестовый проект (`POST /api/projects`, weekly, Phase 1 `periodCount:8` + Phase 2 legacy `weekCount:4`, daysInFTE 20), дёрнул `POST /api/projects/:id/convert-planning-mode` → `monthly`: 12 недель / 4 недели-в-месяце = 3 месяца, вернулось `Phase 1: periodCount 2, Phase 2: periodCount 1` — сходится, `parseProjectPhases`/`phaseLength` (включая legacy `weekCount`) отработали через реальный HTTP-роут. Тестовый проект удалён (`DELETE /api/projects/124`), реальные данные не тронуты. Отдельно проверил `generatePlanRequestSchema` на `/api/projects/generate-plan`: невалидный `region` даёт те же 9 значений enum в ошибке 400 — дедуп `REGION_COLUMNS` не изменил список. LLM-вызов (платный) не делал — не нужен для проверки схемы/математики.

---

## Phase 2 — Консолидация на фронтенде

Самая объёмная и самая рискованная фаза — здесь дублируется бизнес-логика (расчёты), поэтому делать **по одному пункту**, коммит на пункт, тесты после каждого.

- [x] **До рефакторинга** снять с текущего UI на одном реальном проекте итоговые суммы (effort hours / internal cost / client cost / margin) — они станут ожидаемыми значениями теста в следующем пункте. Ручная сверка «до/после» не повторяема, тест — да. Сделано через API вместо кликов в браузере: вытянул проект 9 (`Andrey's test project`, 11 resourcePlans × 12 периодов, 4 фазы) через `GET /api/projects/9`, независимо посчитал totals/phaseTotals/rows[0] по формулам ДО рефакторинга (`scratchpad/baseline-check.mjs`) — эти числа стали ожидаемыми значениями теста.
- [x] Вынести общий `buildPlanFinancials(plans, phases, hrsPerPeriod, exchangeRate)` и заменить 4 независимые копии цикла расчёта:
  `src/App.tsx:743-1025` (`handleExportToExcel`), `src/App.tsx:1027-1314` (`handleExportToPNG`), `src/components/ResourcePlan.tsx:~1140`, `src/components/ClientView.tsx:198-227` (≈ −250 строк). Плюс 5-й найденный по ходу дубль: `ClientView.tsx`'s собственный `handleExportToExcel` (строки ~317-331) пересчитывал efforts/price инлайн вместо переиспользования `calcEfforts`/`calcPrice` — тоже переведён на общие данные. Тест `buildPlanFinancials` на фикстуре из предыдущего пункта — зелёный (`src/utils/calculations.test.ts`, 5 новых кейсов включая legacy `weekCount` и null-margin при нулевом клиентском рейте). **Важно, что НЕ тронуто**: инлайн-парсинг `phases` в `App.tsx` (JSON.parse + fallback) оставлен как есть, не заменён на `parsePhases()` — та функция дополнительно нормализует `periodCount`/`weekCount` и подставляет цвет фазы из палитры, когда `color` не задан в JSON, а App.tsx-инлайн этого не делает (просто серый `FFE8E8E8` как дефолт). Замена сломала бы Excel-раскраску заголовков фаз для проектов без явного `color` — вне scope этого пункта, `buildPlanFinancials` сам умеет `periodCount ?? weekCount ?? 0`, так что достаточно передавать ему уже распарсенные `phases` как есть.
- [x] Вынести таблицу `REGION_FIELDS` (`{slug, field, label}[]`) и собрать 9 колонок RateCard через `.map()` вместо ручного перечисления + 9-way `switch` в `handleAddRateCard` — `src/components/RateCard.tsx:241-431,558-598` (≈ −230 строк). Найдены уже существующие источники этих же 9 регионов — `LOCATIONS` (`src/config/defaults.ts`) и `GENERATE_PLAN_REGIONS` (`src/utils/regions.ts`), в том же порядке — переиспользованы вместо новой таблицы. Их `label` расходится в пунктуации для одного региона (`"Asia (ARM,KZ)"` без пробела в `LOCATIONS`/location-строке vs `"Asia (ARM, KZ)"` с пробелом в `GENERATE_PLAN_REGIONS`/заголовке колонки — уже задокументировано как намеренное в `regions.ts:24-27`), поэтому `REGION_FIELDS` хранит `columnLabel`/`locationLabel` раздельно, а не единый `label` из формулировки плана — сохраняет оба написания как было, `canonicalLocationLabel`/`locationAbbr` уже нормализуют оба варианта.
- [ ] Вынести фабрику `makeFieldColumn(field, header, transform?)` для 6-кратного дублирования `onCellValueChanged` в ResourceList — `src/components/ResourceList.tsx:78-185`
- [ ] Перенести `getAllocationBgColor` в `gridTheme.ts` (уже существующее общее место для темы грида), убрать копию — `src/components/ClientView.tsx:17-29` vs `src/components/ResourcePlan.tsx:80-92`

~~Вынести `buildPlanExcelExport()` (`App.tsx:743-1025`, `ClientView.tsx:265-431`)~~ — **отложено**: пересекается с `buildPlanFinancials` (тот же код в `App.tsx`). Решать после него: если остаток дублирования в форматировании Excel окажется очевидным — отдельный пункт, иначе не трогать.

~~Вынести `drawCells(...)` в `clientViewPng.ts:246-297` (−20 строк)~~ — **не делать**: −20 строк не стоят отдельного PR с ручной сверкой PNG.

**Проверка Phase 2 (обязательно руками в браузере):**
- RateCard: редактирование ставки в каждом из 9 регионов, добавление новой строки через каждый регион
- ResourceList: редактирование всех 6 полей, которые раньше дублировались
- ResourcePlan / ClientView: тест `buildPlanFinancials` зелёный + визуально итоги на том же проекте совпадают со снятыми до рефакторинга
- Экспорт в Excel и в PNG на реальном проекте — сверить, что цифры и форматирование не изменились
- `npm test` (особенно `*.test.tsx` для затронутых компонентов) + `npm run typecheck`

---

## Phase 3 — Точечная гигиена

- [ ] Убрать доступ к приватному инстансу AG Grid через `document.querySelector('.ag-theme-alpine')` + `__agGridReact` + `setTimeout`: завести `gridRef = useRef<AgGridReact>(null)` (в RateCard его сейчас нет) и звать `gridRef.current?.api.sizeColumnsToFit()` — `src/components/RateCard.tsx:105-119`
- [ ] Убрать `setTimeout(() => setResourcePlans(prev => [...prev]), 100)` — no-op, `loadProjectData` уже делает `setResourcePlans` (`src/App.tsx:126`) — `src/App.tsx:730-735`
- [ ] Убрать неиспользуемые дефолтные параметры (все реальные вызовы передают оба аргумента явно) — `src/utils/calculations.ts:79,91` (`hoursPerPeriod`, `estimatedEffortHours`)

~~Убрать `document.execCommand('copy')` fallback (`ResourcePlan.tsx:1174-1191`)~~ — **не делать**: `navigator.clipboard` есть только в secure context (HTTPS/localhost). По `docs/deployment-guide.md` TLS не гарантирован («поставьте nginx»); при открытии по LAN-IP fallback — единственное, что работает. 10 строк, оставить.

**Проверка Phase 3:** проверка ресайза колонок RateCard при переключении региональных табов, импорт проекта в App (кейс, который раньше полагался на `setTimeout`).

---

## Phase 4 — Зависимости

- [x] `npm uninstall better-sqlite3` — нигде не импортируется, Prisma 6 использует свой движок (adapter не настроен)
- [x] Заменить `c12`-загрузку `ai.config.ts` на статический импорт (`ai.config.ts` в git, не per-user) — `server/llm/config.ts:1,28`. Удалить `defineAIConfig` (no-op identity wrapper); в `ai.config.ts` писать `export default { ... } satisfies Partial<AIConfig>` с `import type { AIConfig }` — иначе `ai.config.ts` ↔ `server/llm/config.ts` образуют циклический импорт. Затем `npm uninstall c12`.
- [x] После Phase 0 пакеты, которые использовались только удалёнными UI-обёртками, **нужно удалить руками** — `npm install` из `package.json` ничего не выкидывает:
  `npm uninstall recharts react-day-picker embla-carousel-react cmdk react-hook-form vaul input-otp react-resizable-panels @radix-ui/react-accordion @radix-ui/react-aspect-ratio @radix-ui/react-avatar @radix-ui/react-context-menu @radix-ui/react-hover-card @radix-ui/react-menubar @radix-ui/react-navigation-menu @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-switch`
  (21 пакет; оставшиеся radix — alert-dialog, checkbox, collapsible, dialog, dropdown-menu, label, popover, select, slot, tabs, toggle, toggle-group, tooltip — используются). `package.json`/`package-lock.json` обновлены, не закоммичено (коммит по плану не делался в этой сессии).

**Проверка Phase 4:** `rm -rf node_modules && npm install && npm run build && npm run typecheck && npm test` — зелёные (build/typecheck чистые; тесты 715/727 passed, те же 12 pre-existing localStorage-failures, не связанные с планом). `npx knip` после — deps-список пуст, кроме трёх известных ложных срабатываний (`@ai-sdk/openai` динамический импорт по строке в `server/llm/registry.ts:9`, `@prisma/client` рантайм-зависимость сгенерированного клиента, `@vitest/coverage-v8` через coverage-конфиг). «Unused files» для `ai.config.ts` тоже пропал — подтверждает, что статический импорт встал на место c12. Unused exports/exported types (46+45) — не входят в этот план, см. отдельное обсуждение после Phase 0.

---

## Итог

| Фаза | Что | Риск | Оценка эффекта |
|---|---|---|---|
| 0 | Удаление мёртвых файлов/exports + прокинуть AbortSignal | нулевой | −3900 строк |
| 1 | Консолидация бэкенда | низкий | −40 строк, меньше мест для рассинхрона |
| 2 | Консолидация фронтенда (4 пункта, 2 отложены/сняты) | средний, нужны ручные проверки + тест на `buildPlanFinancials` | −550 строк |
| 3 | Точечная гигиена (3 пункта, clipboard оставлен) | низкий | несколько мест устойчивее к будущим багам |
| 4 | Чистка зависимостей | низкий (после Phase 0) | −23 пакета |

Снято из первоначального аудита: `SkillCache` hot-reload (фича, не долг), `execCommand` fallback (нужен вне HTTPS), `drawCells` (не стоит PR); `buildPlanExcelExport` — отложено до результатов `buildPlanFinancials`.

Рекомендация: фазы 0 и 4 можно сделать в один заход и один PR (чисто механическое удаление). Фазы 1–3 — отдельными PR по пунктам, с прогоном тестов и, где отмечено, ручной проверкой в браузере перед мержем.
