# Deferred Work

Goals split out of the AI Resource Plan Generation feature
([docs/ai-resource-plan-generation-spec.md](../../docs/ai-resource-plan-generation-spec.md)).
Quick Dev run on 2026-06-30 narrowed scope to **Goal 1a — LLM seam & config**
(`spec-ai-llm-seam.md`). Goal 1 (generation backend) was further split into **1a** (current
spec) and **1b** (below). The items below are deferred and should be picked up as their own
Quick Dev specs.

## Goal 1b — Planner & generate-plan endpoint (spec §7–§10, build steps 2–3)

The resource-planner-specific generation logic. **Depends on Goal 1a's `generateStructured()` seam.**

- `server/planner/rateCard.ts` — §7.4 role taxonomy `{discipline, track, seniority}` (normalize from
  `namingInPM`, NOT the role name; ~30 curated deviation rows); role-enum builder; grouped menu;
  `resolveIntRate(rows, role, region)`. Unit test: every `prisma/client_roles.json` role classifies.
- `server/planner/schema.ts` — Zod output schema (role enum built at request time) per §7.1.
- `server/planner/prompt.ts` — selection-policy system prompt (§7.5) + grouped-menu rendering (§7.2).
- `server/planner/phases.ts` — `phaseAllocations` → `Allocation[]` expansion per period.
- `server/planner/generateResourcePlan.ts` — orchestration (§5/§8): build enum+menu → prompt →
  `generateStructured` → resolve rates, convert margin/100 (default fallback), compute `clientHourlyRate`,
  expand `count>1` to N rows, run the `server-validation.ts` gate, collect soft warnings; return
  `{draft, warnings}`; accept an injected model for tests.
- `server.ts` — `POST /api/projects/generate-plan` (modes current/new; in-memory sliding-window
  rate-limit keyed by `req.ip` → 429; empty-rate-card → 409; `NoObjectGeneratedError` → 422; provider
  errors → 502/503; honor `AbortSignal`); declared **above** the SPA catch-all. Endpoint is read-only —
  never writes to the DB.
- `server-validation.ts` — `generatePlanRequestSchema` (`.strict()`; `projectId` required when
  `mode:"current"`; `region` `z.enum` of the 9 `GlobalRateCard` columns).
- Tests: pure-function unit tests with fixture rows + an endpoint guard test (400/429) via supertest.
  **Never seed/wipe the global `GlobalRateCard` in tests** (destructive on the shared `dev.db`).
- Heads-up: the live `GlobalRateCard` is currently **empty** — a real generation needs an Excel import
  first, and `ANTHROPIC_API_KEY` in `.env`. Neither blocks the mock-model tests.

## Goal 2 — AI Assistant UI + draft preview (spec §11)

The user-facing surface. **Depends on Goal 1's `POST /api/projects/generate-plan` contract.**

- `src/components/AIAssistant.tsx` — right-docked, collapsible overlay; launcher FAB mounted once at the
  `App` root; owns chat/draft state; context-aware to `currentProject`.
- `src/components/AssistantComposer.tsx` — prompt input + region selector + send/cancel (non-streaming
  loading state with `abortSignal`).
- `src/components/AssistantReview.tsx` — in-panel control surface: `teamShape` + `selectedDisciplines`
  chips + warnings callout + append/replace selector + Accept/Regenerate/Discard.
- `src/components/ResourcePlan.tsx` — non-destructive draft-preview state (proposed rows tinted/badged,
  editable in place, per-row rationale).
- `src/App.tsx` — mount `<AIAssistant>` once at root (NO new tab).
- `src/services/api.ts` — client wrapper for `generate-plan` (the call itself; types align with Goal 1).

## Goal 3 — Transactional apply + Undo / revisions (spec §16)

The robust acceptance/persistence + undo mechanism. General-purpose ("not AI-specific" per §16.4);
Goal 2's "Accept" should route through this rather than the non-atomic per-row CRUD loop (§16.1).

- `prisma/schema.prisma` — `+ PlanRevision` model (snapshot Json; `@@index([projectId, createdAt])`);
  then `npx prisma generate` + `npx prisma db push`.
- `server.ts` — `+ POST /api/projects/:id/apply-plan` (append/replace, snapshot in a `$transaction`) and
  `+ POST /api/projects/:id/revisions/:revId/restore`.
- `server/planner/applyPlan.ts` — transactional apply (snapshot → mutate), append/replace.
- `server/planner/revisions.ts` — snapshot serialize/restore + retention pruning (~10 per project).
- `src/services/api.ts` — `+ applyPlan()`, `restoreRevision()`, `listRevisions()`.
- `src/components/AIAssistant.tsx` / `ResourcePlan.tsx` — "Plan applied — Undo" toast + History list.
- Note for `mode: "new"`: Undo is just `deleteProject` — handle in UI, don't route through `apply-plan`.
