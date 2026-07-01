---
title: Generate AI Plan — Experience Spec
status: final
updated: 2026-06-30
ui_system: shadcn/Radix + Tailwind v4
design_ref: ./DESIGN.md
mockups:
  - ./mockups/generate-ai-plan.html          # all states: entry · form · loading · result · error · Goal-3
  - ./mockups/proposed-plan-allocation.html  # focused: per-week allocation timeline
sources:
  - _bmad-output/implementation-artifacts/spec-2-generate-plan-ui.md
  - .claude/worktrees/agent-aaacc7a94218ce180/docs/ai-resource-plan-generation-spec.md
---

# Generate AI Plan — Experience Spec

> How the Generate-AI-Plan surface *behaves*. Visual specs live in [DESIGN.md](./DESIGN.md);
> this doc references its tokens by `{path.to.token}`. On any conflict with a mock or the
> source spec, **both spines win**.

## Foundation

- **Form factor:** desktop web app, dense data-tool context. Entry is a toolbar button on
  the **Resource Plan** tab — so a project is **always open** when the surface launches.
  (The "no project open" empty state from §11 of the source spec does **not** apply to
  this toolbar-launched v1; it belongs to the future app-wide overlay.)
- **UI system:** shadcn/Radix. The surface is a **right-docked Sheet** (`sheet.tsx`, built
  on Radix Dialog → inherits focus-trap, Escape, overlay, `role="dialog"`). One Sheet holds
  all three views (form → loading → result); the ResourcePlan grid stays to its left and is
  **never mutated** in v1.
- **Mode:** always `mode: "current"` with the open `projectId`. (`mode: "new"` from the
  source spec is out of v1 scope — no FAB, no project-creation path here.)
- **Component naming:** the source artifact says `GeneratePlanModal` + `Dialog`; this design
  re-negotiates to `GeneratePlanSheet` + `Sheet` (owner-approved override). Same Radix
  dialog semantics; spec-2's Code Map/Tasks should be updated to match.

## Information Architecture

One linear surface, three swappable views inside a single Sheet:

```
[ResourcePlan toolbar] ──click "✦ Generate AI Plan"──▶ Sheet opens (FORM)
                                                          │ Generate
                                                          ▼
                                                       LOADING ──Cancel/abort──▶ FORM
                                                          │ 2xx            │ non-2xx
                                                          ▼                ▼
                                                       RESULT           FORM + error banner
                                                       │ Back→FORM (keeps result)
                                                       │ Accept→console.log (stays open)
                                                       │ Discard / ✕ / Esc→close + reset
```

- **State ownership:** `showGeneratePlan` boolean in `ResourcePlan.tsx`; all form/result
  state inside `GeneratePlanSheet.tsx`. No `App.tsx` changes. `ResourcePlan.tsx` also passes
  its current **phases** (and planning mode) into the Sheet as a prop, so the allocation
  timeline can group weeks even when `applyProposedPhases` is off.
- **Reset invariant:** every close path (✕, Cancel, Discard, Escape, overlay) resets
  description, region (→`ukraine`), checkbox (→off), `loading`, `error`, `result` to
  defaults. Reopening is always a clean form.
- **Result is held, not re-fetched:** Back returns to the form without losing `result`;
  the user can re-open the result without regenerating (until they Generate again or close).

## Voice and Tone

Plain, operational, second-person. No hype, no anthropomorphic chatter. (Brand voice →
DESIGN.md.Brand & Style.)

| Surface | Copy |
|---|---|
| Toolbar button | `✦ Generate AI Plan` |
| Sheet title — form | `✦ Generate AI Plan` |
| Sheet title — result | `✦ Proposed plan` |
| Context subline | `{project.name} · {weekly\|monthly} · {N}w · {currency} · {margin}% margin` |
| Description label / placeholder | `Describe the project` / `e.g. 3-month e-commerce redesign, ~6 people, build-heavy` |
| Description hint | `The AI proposes roles & allocations grounded in your rate card. Nothing is saved until you accept.` |
| Region label | `Delivery region` |
| Checkbox label / hint | `Apply proposed phases` / `Let the AI restructure the project timeline if its plan implies one.` |
| Generate (idle / busy) | `Generate` / `Generating…` |
| Loading status | `Drafting team…` + `Usually 5–20 seconds.` |
| Cancel | `Cancel` |
| Warnings callout | server warning string, verbatim, prefixed ⚠ |
| Result hint | `Rates to 2 decimals. Allocation: one bar = one week, height snapped to 0/25/50/75/100% (0–8h/day). Long timelines scroll horizontally.` |
| Result actions | `‹ Back` · `Discard` · `Accept plan` |
| Errors | server `body.error`, verbatim (e.g. `Rate limit exceeded. Try again in about 12 minutes.`) |

Tone rule: errors state *what happened and what to do*, never blame the user. Warnings say
"review", not "fix" — they never block Accept.

## Component Patterns (behavioral)

- **Description (Textarea).** Required. Generate is disabled while `loading || !description.trim()`
  (whitespace-only counts as empty). No max length enforced client-side.
- **Delivery region (Select).** 9 fixed options, label→value: Ukraine→`ukraine` (default),
  Eastern Europe→`easternEurope`, Asia (GE)→`asiaGE`, Asia (ARM, KZ)→`asiaARMKZ`,
  LATAM→`latam`, Mexico→`mexico`, India→`india`, New York→`newYork`, London→`london`.
  Order & labels are frozen (Ask-First to change). Values are `REGION_COLUMNS` keys —
  **never** the kebab-case LOCATIONS slugs.
- **Apply proposed phases (Checkbox).** Default off. Sent in the request **only when true**
  (omit/undefined when false).
- **Generate (Button, primary).** Submits → LOADING. Label swaps to `Generating…`; all
  fields + close disabled during flight.
- **Result table.** One row per `resourcePlans[i]`: role = `clientRole ?? role`; internal
  rate and client rate formatted to exactly 2 decimals; rationale sub-line from `rationale?`
  (expander when long, hidden when absent); allocation timeline (below).
- **Allocation timeline (`{components.alloc-timeline}`).** The Allocation column is a
  per-week mini-chart:
  - **Phase header (drawn once, column head):** a **week-counts row** (`2w · 8w · 2w`) on
    top, then **pastel phase-name bands** (`Discovery / Build / Launch`) directly above the
    bars; band widths ∝ phase `periodCount`.
  - **Per row:** **one bar per week**, height = that week's allocation **snapped to
    0/25/50/75/100%** (= 0/2/4/6/8 h/day). A 0% week is a flat `{colors.alloc-bar-zero}`
    stub. Bars are grouped by phase (gap between groups), aligned under the header.
  - **Phase source:** `draft.phases` when phases were applied; otherwise the **project's
    current phases**, passed into `GeneratePlanSheet` as a prop (parsed via
    `parsePhases`/`getPhaseForPeriod`). If neither exists, a single `Plan · Nw` band.
  - **Snapping:** the model's raw `allocation` % is rounded to the nearest 2h step for both
    height and any shown value (the plan reads in native 2h granularity; AI % is approximate).
  - **Overflow:** when weeks exceed the column width, the header **and** bar rows scroll
    **horizontally together** as one unit (alignment preserved); 1 bar = 1 week always — no
    per-phase collapse, no down-sampling.
  - Read-only in v1 (no inline editing of bars).
- **Warnings.** Rendered as a `{components.warning-callout}` block **only** when
  `warnings.length > 0`; stacked if multiple. Dismissible visual is optional; never gates
  Accept.

## State Patterns

| State | Trigger | UI | Exits |
|---|---|---|---|
| **Idle (form)** | Sheet opens | empty form, Generate disabled | Generate (when valid) · close |
| **Validating** | description empty/whitespace | Generate disabled, no error noise | type valid text |
| **Loading** | Generate clicked | quoted prompt + spinner + `Drafting team…`; fields & ✕ disabled; Cancel shown | 2xx→Result · non-2xx→Error · Cancel/Esc→Idle |
| **Result** | 2xx response | `{components.rate-table}` with per-week `{components.alloc-timeline}` + warnings (if any); footer Back/Discard/Accept | Back→Idle (keeps result) · Accept→stub · Discard/close→reset |
| **Result, no warnings** | `warnings.length === 0` | callout omitted entirely | as Result |
| **Error (recoverable)** | non-2xx (`body.error`) | red banner above the form; inputs preserved | edit & retry · close |
| **Rate-card empty** | 409 | banner: "Rate card is empty…" | close, import rate card |
| **Closed** | any close path | — | next open = clean Idle |

## Interaction Primitives

- **Open:** toolbar button → `setShowGeneratePlan(true)`. Focus moves to the description
  textarea.
- **Submit:** Generate → `api.generatePlan({ mode:'current', projectId, description, region, …applyProposedPhases?true })`.
- **Cancel (loading):** aborts the in-flight request via `AbortSignal`; returns to Idle with
  inputs intact (no error banner — cancellation is not an error).
- **Back (result):** view → Idle, `result` retained in memory.
- **Discard / ✕ / Escape / overlay click:** close + full reset.
- **Accept (v1):** `console.log('TODO Goal 3:', result.draft)`; Sheet **stays open**; no
  navigation, no write.
- **During loading:** ✕ and overlay are inert; **Escape = Cancel** (abort + return to form),
  so keyboard users are never trapped.

## Accessibility Floor

- Radix Sheet provides `role="dialog"`, `aria-modal`, focus trap, and restores focus to the
  toolbar button on close. Title is the accessible name.
- Every control has a visible `<Label>` (description, region, checkbox); the checkbox hint is
  associated via `aria-describedby`.
- **Live regions:** loading status (`Drafting team…`) and the error banner use `aria-live`
  ("polite" for loading, "assertive" for errors) so screen readers announce state changes.
  The warnings callout is announced when the result renders.
- Generate's disabled state is conveyed by `disabled` (not colour alone); `Generating…`
  communicates progress as text, not just the spinner.
- **Contrast:** `{colors.warning-foreground}` on `{colors.warning-bg}` and the red error
  pair both meet WCAG AA for body text. The ✦ glyph is decorative (`aria-hidden`); the AI
  meaning is carried by the visible "Generate AI Plan" / "Proposed plan" text.
- The allocation timeline is decorative SVG/DOM; each role's bar strip carries a non-visual
  text alternative summarizing per-phase allocation (e.g.
  `aria-label="Discovery wk1–2: 25%; Build wk3–10: 100%; Launch wk11–12: 50%"`), so the data
  is reachable without seeing the bars. Phase bands use text labels (names + week counts),
  not colour alone, to convey phase identity.
- Full keyboard path: open → Tab through fields → Generate (Enter) → Tab to actions →
  Escape to close. No pointer-only affordance.

## Key Flows

### Flow A — Marina scopes a pitch in five minutes (v1, happy path)

Marina, a delivery lead, has a sales call in ten minutes and an empty Resource Plan for the
"Acme storefront redesign" project already open (weekly, 12 weeks, EUR, 45% margin).

1. She clicks **✦ Generate AI Plan** in the toolbar. The Sheet slides in from the right; the
   empty grid stays visible behind it. Focus lands in the description box.
2. She types *"3-month e-commerce redesign, ~6 people, build-heavy"* and leaves region on
   **Ukraine**. Generate enables the moment she has real text.
3. She clicks **Generate**. The button reads **Generating…**, fields lock, a spinner shows
   under her quoted prompt with "Drafting team…".
4. **— climax —** ~8 seconds later the Sheet flips to **Proposed plan**: six roles with
   internal and client rates, a PM steady across phases, engineers ramping into Build, a
   designer front-loaded into Discovery — each with a one-line rationale. An amber callout
   warns *"No QA while development roles are present — review."* She reads it, nods: it's a
   pitch number, QA comes later.
5. She skims the client rates, clicks **Accept plan**. (In v1 this logs the draft and keeps
   the Sheet open — the real apply lands in Goal 3, Flow C.) She has a credible team and
   pricing with two minutes to spare.

### Flow B — Generation fails, Marina recovers without losing her words

1. Marina clicks **Generate**; the provider is briefly down. The Sheet returns to the **form**
   with a red banner: *"AI provider error. Please try again."* — her description and region
   are exactly as she left them.
2. She waits a beat, clicks **Generate** again; it succeeds. She never re-typed anything, and
   nothing in her project changed. (Same recovery shape for 429 rate-limit, 409 empty
   rate-card, 422 schema, 502/503.)

### Flow C — Accept → apply with Undo  ·  FUTURE (Goal 3, not built in v1)

> Documented here so the v1 result view is forward-compatible. Requires the transactional
> `POST /api/projects/:id/apply-plan` endpoint + `PlanRevision` model (source spec §16) —
> **none of this is implemented in v1.** v1's Accept is the `console.log` stub above.

1. In the result view, Marina chooses an **apply mode**: **Add to plan** (`append`, default,
   non-destructive) or **Replace plan** (`replace`, destructive — wipes current rows, and
   phases when `applyProposedPhases`).
2. She clicks **Accept plan**. One transactional call snapshots the current plan into a
   `PlanRevision`, then writes the draft. The Sheet closes; the grid now shows the real rows.
3. A toast appears: **"Plan applied — Undo."** One click restores the snapshot (itself
   reversible → redo).
4. A **History** affordance on the project lists recent revisions to restore beyond the last
   action.
5. **Regenerate** (multi-turn): a follow-up instruction ("make it more senior", "drop the BA")
   re-runs generation with the prior context and re-projects a fresh draft — still unsaved
   until Accept.

---

## Open items

- `[NOTE FOR DEV]` `api.ts` `GeneratePlanResourcePlan` type must add `rationale?: string` to
  match the live payload (the rich result view depends on it).
- `[NOTE FOR DEV]` `GeneratePlanSheet` takes a **phases** prop (project's current phases +
  planning mode) so the allocation timeline groups weeks; `displayOrder`-ordered
  `allocations[]` map period→week, `getPhaseForPeriod` assigns each week to a phase band.
- `[NOTE FOR DEV]` Snap each week's `allocation` to the nearest of {0,25,50,75,100} for bar
  height and any shown value.
- `[ASSUMPTION]` Loading copy "Usually 5–20 seconds" — adjust to observed p95 latency once
  measured.
- `[DEFERRED]` `teamShape` one-liner + `selectedDisciplines` chips need a backend change to
  pass them through; chips are reserved in DESIGN.md but not rendered in v1.
