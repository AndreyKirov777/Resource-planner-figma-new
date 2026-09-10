---
title: Generate AI Plan — Visual Identity
status: final
updated: 2026-06-30
inherits: shadcn/Radix + Tailwind v4 — project tokens in src/styles/globals.css
note: >
  This feature inherits the app's existing design system. DESIGN.md records only the
  visual DELTA for the Generate-AI-Plan surface plus the few inherited tokens that
  EXPERIENCE.md references by name. Anything not listed here uses the app default.
colors:
  # --- inherited (reference only; source of truth = globals.css) ---
  primary: "#030213"
  primary-foreground: "oklch(1 0 0)"
  secondary: "oklch(0.95 0.0058 264.53)"
  muted: "#ececf0"
  muted-foreground: "#717182"
  accent: "#e9ebef"
  destructive: "#d4183d"
  border: "rgba(0, 0, 0, 0.1)"
  input-background: "#f3f3f5"
  # --- DELTA: feature-introduced tokens (no equivalent exists in globals.css) ---
  warning-bg: "#fffbeb"        # amber-50  — soft composition-warning callout background
  warning-border: "#fde68a"    # amber-200 — callout border
  warning-foreground: "#92400e" # amber-800 — callout text
  warning-icon: "#d97706"      # amber-600 — callout glyph
  ai-accent: "#6d28d9"         # violet-700 — AI ✦ glyph + Goal-3 marker ONLY (not a fill)
  alloc-bar: "#52525b"         # zinc-600 — monochrome per-week allocation bar
  alloc-bar-zero: "#d4d4d8"    # zinc-300 — 0% week stub
  # phase bands reuse src/utils/phases.ts PHASE_COLORS pastels (e.g. #E3F2FD/#FCE4EC/#E8F5E9)
typography:
  base-size: "14px"            # inherited --font-size
  weight-normal: 400
  weight-medium: 500
  numeric: "tabular-nums"      # DELTA: rate/allocation columns use tabular figures
rounded:
  lg: "0.625rem"               # --radius (Sheet, callouts)
  md: "calc(0.625rem - 2px)"   # controls, buttons
  sm: "calc(0.625rem - 4px)"   # checkbox, chips inner
  pill: "999px"                # discipline chips (reserved)
  band: "5px"                  # phase-name bands in the allocation header
spacing:
  sheet-width: "min(420px, 92vw)"   # form/loading; result may grow to 560px
  sheet-pad: "16px"
  field-gap: "14px"
  table-cell-y: "7px"
components:
  sheet: "right-docked; 3px primary left-accent; -8px 0 24px rgba(0,0,0,.08) shadow"
  warning-callout: "warning-bg / warning-border / warning-foreground; md radius"
  rate-table: "shadcn table; muted 11.5px header; tabular-nums numeric cols"
  alloc-timeline: "Allocation column = phase header (week-counts row over pastel phase-name bands) + one monochrome bar per week, height snapped to 0/25/50/75/100%; header+bars scroll horizontally together"
---

# Generate AI Plan — Visual Identity

> Delta spec. The feature lives inside the existing Resource Planner shell (shadcn/Radix
> + Tailwind v4). It introduces **two** new visual primitives — an amber *warning* token
> set and a violet *AI-accent* glyph — and one new surface treatment (the right Sheet).
> Everything else reuses app defaults. Mockups: [mockups/generate-ai-plan.html](mockups/generate-ai-plan.html) (all states) · [mockups/proposed-plan-allocation.html](mockups/proposed-plan-allocation.html) (allocation timeline).

## Brand & Style

The app's voice is **utilitarian, dense, professional** — a planning tool for delivery
leads, not a consumer app. The AI surface must read as a *trustworthy assistant inside a
spreadsheet*, not a chatbot: restrained, no gradients, no illustration, no playful motion.
The single expressive note is the ✦ glyph in `{colors.ai-accent}` that marks "this is the
AI feature." Confidence comes from clarity (real rates, real rationale), not decoration.

## Colors

Inherits the neutral oklch palette. Two additions:

- **Warning (amber).** The existing system has only `{colors.destructive}` (red) for
  negative states. The plan's *composition warnings* (§8.6 of the source spec) are
  **advisory, not errors** — red would over-signal. New amber token set
  `{colors.warning-bg}` / `{colors.warning-border}` / `{colors.warning-foreground}` /
  `{colors.warning-icon}` gives a softer "review this" register. Hard errors keep red
  (`{colors.destructive}`).
- **AI-accent (violet).** `{colors.ai-accent}` is used **only** for the ✦ glyph and the
  Goal-3 "future" marker — never as a button fill or large area. It tags the feature
  without inventing a competing brand colour.

Dark-mode values for both deltas are defined at Finalize against the app's `.dark` block.

## Typography

Inherits the 14px system stack. One delta: **all numeric columns** (internal rate, client
rate, allocation %) use `{typography.numeric}` so figures align on the decimal — essential
in a rates table read for comparison. Role names: `{typography.weight-medium}`. Rationale &
hints: `{colors.muted-foreground}`, ~11.5px.

## Layout & Spacing

- **Right-docked Sheet**, `{spacing.sheet-width}` for form/loading; the result view may
  grow to ~560px to give the rates table room. The ResourcePlan grid stays visible to the
  left and is **never** reflowed or mutated.
- Body padding `{spacing.sheet-pad}`; vertical rhythm between fields `{spacing.field-gap}`.
- Footer is a fixed action bar (border-top), actions right-aligned; destructive/neutral
  actions (Back, Discard) separated from the primary (Accept/Generate) by a flex spacer.

## Elevation & Depth

The Sheet is the only elevated layer: `{components.sheet}` shadow + a 3px
`{colors.primary}` left accent so it reads as *docked*, not floating. No nested shadows;
the warning callout and table are flat (border-defined), consistent with the app.

## Shapes

Radii inherit: Sheet & callouts `{rounded.lg}`, controls/buttons `{rounded.md}`, checkbox
`{rounded.sm}`, discipline chips `{rounded.pill}`, allocation phase bands `{rounded.band}`.
No new shape language.

## Components

| Component | Visual spec |
|---|---|
| **Generate AI Plan button** | `variant="outline" size="sm"`, leading ✦ in `{colors.ai-accent}`. Label "Generate AI Plan". Lives in the ResourcePlan toolbar. |
| **Sheet** | `{components.sheet}`. Header: ✦ title + context subline (`{colors.muted-foreground}`) + close ✕. Footer: action bar. |
| **Warning callout** | `{components.warning-callout}`, leading ⚠ in `{colors.warning-icon}`. One per warning or a stacked list; shown only when `warnings.length > 0`. |
| **Rate table** | `{components.rate-table}`. Columns: Role · Int. rate · Client rate · Allocation. Numeric cols `{typography.numeric}`, right-aligned. |
| **Allocation timeline** | `{components.alloc-timeline}`. Column header = a **week-counts row** (`2w·8w·2w`, `{colors.muted-foreground}`) over **pastel phase-name bands** (PHASE_COLORS), band width ∝ weeks. Each row = one `{colors.alloc-bar}` bar **per week**, height = snapped allocation: 0%→2px stub `{colors.alloc-bar-zero}`, 25%→7px, 50%→13px, 75%→18px, 100%→24px. Bars grouped by phase (gap between groups). Read-only in v1. |
| **Rationale row** | Sub-line under the role, `{colors.muted-foreground}`, expandable (▸/▾) when text is long. |
| **Discipline chips** | `{rounded.pill}`, `{colors.secondary}`. **Reserved** — only rendered if the backend later returns `selectedDisciplines` (not in v1 payload). |

## Do's and Don'ts

- **Do** keep amber for *advisory* warnings and red for *hard* errors — never mix.
- **Do** keep the ✦ glyph the single AI signifier; one per surface.
- **Do** let bar **height** be the only quantitative encoder of allocation; keep bars monochrome `{colors.alloc-bar}` and reserve pastel only for phase *identity* (the bands). Never colour-code height.
- **Do** snap allocation to the 2h/day grid (0/25/50/75/100%) — both bar height and any shown value.
- **Don't** tint or mutate the ResourcePlan grid in v1 — the draft lives entirely in the
  Sheet (the in-grid preview is a deliberately rejected alternative).
- **Don't** introduce chatbot affordances (avatars, bubbles, typing dots) — this is a
  form→result tool, not a conversation, in v1.
- **Don't** use `{colors.ai-accent}` as a fill or for non-AI elements.
