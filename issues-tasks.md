# Issues & Tech Debt Tracker

> Generated from full codebase review. Fix issues individually or by severity group.
> Mark checkboxes as tasks are completed.

---

## Critical

- [x] **C1 — `.env` file committed to source control**
  - **File:** `.env`
  - **Details:** The `.env` file containing `DATABASE_URL` is tracked in git. Even though `.gitignore` lists `.env`, the file was already committed. Remove it from tracked files with `git rm --cached .env`.
  - **Fixed:** Verified `.env` is not in the repo (`git ls-files` does not list it). If it was ever committed, run `git rm --cached .env` locally and commit; `.gitignore` already excludes `.env`.

- [x] **C2 — No input validation/sanitization on server API endpoints**
  - **Files:** `server.ts` (lines 69, 80, 306, 350, 364)
  - **Details:** Multiple PUT/POST routes pass `req.body` directly to Prisma (`data: req.body`). Clients can overwrite any field including `id`, `createdAt`, `projectId`. Add a validation layer (e.g. Zod) and whitelist allowed fields before passing to Prisma.
  - **Fixed:** Added `server-validation.ts` with Zod schemas and whitelisted fields. All affected endpoints (projects create/update, rate-cards update, resource-lists create/update, resource-plans create/update, weekly-allocations create/update) now validate and pass only allowed fields to Prisma.

- [x] **C3 — `deleteAllRateCards` deletes across ALL projects**
  - **File:** `server.ts` (line 327)
  - **Details:** `prisma.rateCard.deleteMany({})` has no project filter — it wipes rate cards for every project in the database. Should filter by `projectId`.
  - **Fixed:** New project-scoped route `DELETE /api/projects/:projectId/rate-cards` deletes only that project's rate cards. Client `api.deleteAllRateCards(projectId)` and `handleDeleteAllRateCards` now pass `currentProject.id`. Legacy `DELETE /api/rate-cards` requires `?projectId=` and returns 400 if missing.

---

## High

- [ ] **H1 — Missing `tsconfig.json`**
  - **File:** Project root
  - **Details:** No `tsconfig.json` exists. TypeScript has no strict mode, no compile-time type checking, and path aliases (`@/`) only work through Vite, not the TS compiler or editors.

- [ ] **H2 — `window` object pollution for AG Grid callbacks**
  - **Files:** `src/components/ResourceList.tsx` (line 161), `src/components/RateCard.tsx` (line 590)
  - **Details:** Functions are attached to `(window as any).deleteResource` and `(window as any).addRateCard` to communicate between AG Grid cell renderers and parent components. Use AG Grid's `context` API instead.

- [ ] **H3 — Two different grid libraries in the same app**
  - **Files:** `src/components/ResourcePlan.tsx` (Glide Data Grid), `src/components/ResourceList.tsx` and `src/components/RateCard.tsx` (AG Grid)
  - **Details:** Using both `@glideapps/glide-data-grid` and `ag-grid-react` doubles the grid-related bundle size and creates UI inconsistency. Standardize on one library.

- [ ] **H4 — Sequential API calls in update loops (N+1 problem)**
  - **File:** `src/App.tsx` (lines 88–92, 126–130)
  - **Details:** `handleResourceListsChange` and `handleRateCardsChange` iterate over all items and `await` an individual update call for each. Replace with a single batch/bulk update endpoint.

- [ ] **H5 — `src/index.css` is a compiled Tailwind output checked into source**
  - **File:** `src/index.css` (836K+ characters)
  - **Details:** This is a generated Tailwind v4 CSS bundle committed to the repo. It should be generated at build time from a small source file with Tailwind directives, not version-controlled.

- [ ] **H6 — No authentication or authorization on the API**
  - **File:** `server.ts`
  - **Details:** The entire Express API is open to any client. Any user can read, modify, or delete any project's data without authentication.

---

## Medium

- [ ] **M1 — `daysInFTE` project setting is never used in calculations**
  - **Files:** `src/App.tsx` (line 387), `src/components/ResourcePlan.tsx` (line 205), `src/components/ResourceList.tsx` (line 141)
  - **Details:** Hours per day are hardcoded as `8` and hours per week as `40` everywhere, completely ignoring the `daysInFTE` field the user can configure on the project.

- [ ] **M2 — Duplicated business logic for cost/margin/effort calculations**
  - **Files:** `src/App.tsx` (Excel export, lines 386–463), `src/components/ResourcePlan.tsx` (lines 199–227, 905–912)
  - **Details:** The same margin, total cost, and estimated effort formulas are duplicated in multiple files. Extract into a shared utility module to prevent divergence.

- [ ] **M3 — Exchange rate label inconsistent with actual semantics**
  - **File:** `src/components/ResourcePlan.tsx` (line 1020)
  - **Details:** Label says "Exchange rate (to USD)" but the default value is `0.89` (USD-to-EUR). The naming and calculation direction are confusing. Clarify whether this is "USD to client currency" or vice versa.

- [ ] **M4 — Pervasive use of `any` type throughout the codebase**
  - **Files:** `src/components/RateCard.tsx`, `src/components/ResourceList.tsx`, `src/components/ResourcePlan.tsx`, `src/App.tsx`, `server.ts`
  - **Details:** `any` is used extensively for AG Grid props, event handlers, Prisma import data, and more. Replace with proper typed interfaces.

- [ ] **M5 — `exceljs` bundled in the frontend**
  - **Files:** `src/App.tsx` (line 13), `src/components/RateCard.tsx` (line 9)
  - **Details:** `exceljs` is a large Node.js-oriented library (~1.5MB) imported and bundled into the client-side code. Excel generation should be moved to the server or use a lighter client-side alternative.

- [ ] **M6 — Data quality issues in `clientRoleMapping.ts`**
  - **File:** `src/utils/clientRoleMapping.ts`
  - **Details:** Multiple data errors in the hardcoded mapping:
    - Trailing spaces: `"Junior "`, `"Senior "`, `"Middle "`, `"Strong Middle "`, etc.
    - Typos: `"Principle DB Engineer"` → should be "Principal" (lines 523, 549, 573)
    - Garbled text: `"Strong Junior DeveSecurity Engineerloper"` (line 660)
    - Truncated: `"AEM Backend Develope"` (line 785)
    - Duplicated words: `"Tech Writer Technical Writer"` (line 221), `"Solution Consultant Solution Consultant, Data & Analytics"` (line 500)
    - Double spaces: `"Junior  BI Engineer "` (line 430)
    - Incorrect word order: `"Lead Team , Core Technologies"` (line 41) → should be "Team Lead"

- [ ] **M7 — Hardcoded mapping duplicates `prisma/client_roles.json`**
  - **Files:** `src/utils/clientRoleMapping.ts`, `prisma/client_roles.json`
  - **Details:** The same role mapping data exists in two places with no single source of truth. Load from the JSON file or serve from the API instead.

- [ ] **M8 — Unpinned dependency versions in `package.json`**
  - **File:** `package.json`
  - **Details:** `ag-grid-community`, `ag-grid-react`, `clsx`, and `tailwind-merge` use `"*"` (any version). Builds are non-deterministic across environments. Pin to specific versions.

- [ ] **M9 — Invalid `name` field in `package.json`**
  - **File:** `package.json` (line 2)
  - **Details:** `"name": "Resource Planning Application"` contains spaces, which violates npm naming rules. Use a slug like `"resource-planning-application"`.

- [ ] **M10 — `prisma` CLI listed as production dependency**
  - **File:** `package.json`
  - **Details:** `"prisma": "^6.15.0"` is in `dependencies` instead of `devDependencies`. Only `@prisma/client` is needed at runtime.

- [ ] **M11 — Duplicate default project creation logic**
  - **Files:** `server.ts` (line 17, `initializeDefaultProject()`), `src/App.tsx` (line 43, `loadProjectData()`)
  - **Details:** Both the server and the client independently create a default project if none exists. These use different code paths and could create duplicates or conflicts.

---

## Low

- [ ] **L1 — `console.log` debug statements left in production code**
  - **Files:** `src/App.tsx` (lines 141, 158, 188), `src/components/RateCard.tsx` (lines 456, 579), `server.ts` (lines 229, 265)
  - **Details:** Debug logging statements should be removed or replaced with a proper logger that respects log levels.

- [ ] **L2 — Spelling error in UI: "custome" → "custom"**
  - **File:** `src/components/ResourceList.tsx` (line 197)
  - **Details:** `<CardTitle>Add custome resource</CardTitle>` — typo in user-facing text.

- [ ] **L3 — Unused variable `isValidRole`**
  - **File:** `src/components/ResourcePlan.tsx` (line 375)
  - **Details:** `const isValidRole = resourceLists.some(r => r.role === plan.role);` is computed but never referenced.

- [ ] **L4 — Unused function `validateRole`**
  - **File:** `src/components/ResourcePlan.tsx` (lines 786–788)
  - **Details:** `validateRole` is defined with `useCallback` but never called anywhere.

- [ ] **L5 — `ImageWithFallback.tsx` component appears unused**
  - **File:** `src/components/figma/ImageWithFallback.tsx`
  - **Details:** Not imported by any other file in the project. Dead code.

- [ ] **L6 — `alert()` and `confirm()` used instead of toast notifications**
  - **Files:** `src/App.tsx` (lines 317, 336), `src/components/RateCard.tsx` (lines 469, 472, 477, 482, 499, 502)
  - **Details:** `sonner` (toast library) is already a dependency but native `alert()`/`confirm()` are used for user feedback. Replace with toast notifications for better UX.

- [ ] **L7 — `setTimeout` hack for post-import re-render**
  - **File:** `src/App.tsx` (lines 322–325)
  - **Details:** A `setTimeout(() => setResourcePlans(prev => [...prev]), 100)` is used to force a re-render after import. Fragile and unnecessary — proper state flow should handle this.

- [ ] **L8 — Stale `nul` file at project root**
  - **File:** `nul`
  - **Details:** Likely a Windows artifact from accidentally redirecting output to `nul`. Should be deleted and added to `.gitignore`.

- [ ] **L9 — No `<React.StrictMode>` wrapper**
  - **File:** `src/main.tsx` (line 6)
  - **Details:** The app renders `<App />` without `<React.StrictMode>`, missing development-time warnings for deprecated patterns and side-effect detection.

- [ ] **L10 — Vite config has ~30 unnecessary versioned aliases**
  - **File:** `vite.config.ts` (lines 14–51)
  - **Details:** Aliases like `'vaul@1.1.2': 'vaul'` and `'@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip'` are artifacts from an automated tool. Vite resolves bare specifiers by default — these are dead config.

- [ ] **L11 — Missing `@types/react` and `@types/react-dom` in devDependencies**
  - **File:** `package.json`
  - **Details:** No React type definitions are installed, which may cause editor type resolution issues.

- [ ] **L12 — Optimistic update immediately overwritten by re-fetch**
  - **File:** `src/App.tsx` (lines 244–253)
  - **Details:** `handleAddResourcePlan` adds to state optimistically, then immediately fetches the full list from the server — making the optimistic update pointless. Choose one strategy.

- [ ] **L13 — Magic number `9` used for week column start index**
  - **File:** `src/components/ResourcePlan.tsx` (lines 678, 798)
  - **Details:** The week column offset `9` is hardcoded in two places. If columns are added or reordered, these must be manually kept in sync. Derive from the column definitions instead.

- [ ] **L14 — Duplicate CSS entry points with unclear relationship**
  - **Files:** `src/index.css`, `src/styles/globals.css`
  - **Details:** Both files deal with styling concerns. `globals.css` has design tokens and base typography; `index.css` is a massive compiled output. Consolidate into a clear structure.

- [ ] **L15 — Unused imports in source files**
  - **Files:** `src/App.tsx` (`Input`, `Textarea` imported but unused in JSX), `src/components/RateCard.tsx` (`Search`, `X` from lucide-react imported but unused)
  - **Details:** Dead imports increase bundle noise and reduce readability.

---

## Statistics

| Severity | Count |
|----------|-------|
| Critical | 3     |
| High     | 6     |
| Medium   | 11    |
| Low      | 15    |
| **Total**| **35**|
