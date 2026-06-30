# Component Inventory — Resource Planner

_Generated: 2026-06-30 · Deep scan · Frontend: React 18 + TypeScript_

Two tiers: **feature components** (one per workspace tab, plus a client view) and **UI primitives**
(shadcn-style Radix wrappers). All domain data flows from [App.tsx](../src/App.tsx) via props + callbacks.

## Feature Components ([src/components/](../src/components/))

| Component | File | LOC | Grid | Responsibility |
| --- | --- | --- | --- | --- |
| `App` | [src/App.tsx](../src/App.tsx) | 1075 | — | Top-level state hub; 4-tab layout; Excel/JSON/PNG export; AG Grid module registration |
| `ProjectList` | [ProjectList.tsx](../src/components/ProjectList.tsx) | 452 | — | List projects; open/create/copy/delete/rename; surfaces created/updated dates |
| `ResourcePlan` | [ResourcePlan.tsx](../src/components/ResourcePlan.tsx) | 1679 | Glide | **Core planning grid** — roles, rates, per-period allocations, phases, totals, planning-mode toggle, settings |
| `ResourceList` | [ResourceList.tsx](../src/components/ResourceList.tsx) | 336 | AG Grid | Manage a project's resource roster (roles, names, internal rates) |
| `RateCard` | [RateCard.tsx](../src/components/RateCard.tsx) | 736 | AG Grid | Global rate-card grid + Excel import/clear; regional rates; add-to-resource-list |
| `ClientView` | [ClientView.tsx](../src/components/ClientView.tsx) | 551 | Glide | Client-facing read view of the plan (cleaned-up pricing) |
| `ImageWithFallback` | [figma/ImageWithFallback.tsx](../src/components/figma/ImageWithFallback.tsx) | — | — | Figma-exported image helper with fallback |

### Prop contracts (controlled components)
Each feature component receives data + callbacks from `App.tsx`. Representative shapes:

- **ResourcePlan** (`ResourcePlanProps`): `project`, `resourceLists`, `resourcePlans`,
  `onResourcePlansChange`, `onAddResourcePlan`, `onDeleteResourcePlan`, `onReorderResourcePlans`,
  `onProjectSettingsChange`, `onExportProject`/`onImportProject`/`onExportToExcel`/`onExportToPNG`,
  `onClearAllResourcePlans`, `onConvertPlanningMode`, plus editable name/description handlers.
- **ResourceList** (`ResourceListProps`): `resourceLists`, `onResourceListsChange`, `onResourceListUpdate`,
  `onAddResourceList`, `onDeleteResourceList`, `onClearAllResourceLists`.
- **RateCard** (`RateCardProps`): `rateCards`, `importMeta`, `onRateCardsChange`, `onRateCardUpdate`,
  `onAddRateCard`, `onAddRateCardsBulk`, `onDeleteRateCard`, `onDeleteAllRateCards`, `onAddResourceList`,
  `defaultLocation`.
- **ProjectList** (`ProjectListProps`): `onOpenProject`, `currentProjectId`, `onProjectDeleted`,
  `onProjectUpdated`.
- **ClientView**: self-contained (`export default function ClientView()`).

> Convention: a feature component reads its data from props and reports changes upward — it does not own
> domain state or call the API directly except where it composes the provided callbacks.

## UI Primitives ([src/components/ui/](../src/components/ui/)) — 48 files

shadcn-style wrappers over Radix UI, named `kebab-case.tsx`. Reuse these instead of raw Radix or bespoke
inputs/dialogs; treat as generated and extend deliberately. Compose classes with `cn()` from
[ui/utils.ts](../src/components/ui/utils.ts).

| Category | Primitives |
| --- | --- |
| Layout / surface | `card`, `separator`, `aspect-ratio`, `scroll-area`, `resizable`, `sidebar`, `sheet`, `skeleton` |
| Navigation | `tabs`, `navigation-menu`, `menubar`, `breadcrumb`, `pagination`, `command` |
| Overlays | `dialog`, `alert-dialog`, `drawer`, `popover`, `hover-card`, `tooltip`, `context-menu`, `dropdown-menu` |
| Forms / inputs | `form`, `input`, `input-otp`, `textarea`, `label`, `checkbox`, `radio-group`, `select`, `switch`, `slider`, `toggle`, `toggle-group`, `button`, `calendar` |
| Data display | `table`, `badge`, `avatar`, `progress`, `chart`, `accordion`, `collapsible`, `carousel`, `alert` |
| Feedback / misc | `sonner` (toasts), `use-mobile.ts` (hook), `utils.ts` (`cn()` helper) |

## Design System Notes

- **Styling:** Tailwind CSS v4 utility classes; conditional composition via `cn()` (clsx + tailwind-merge).
  Global tokens/styles in [src/styles/globals.css](../src/styles/globals.css) and
  [src/index.css](../src/index.css).
- **Icons:** `lucide-react`. **Toasts:** `sonner`. **Theme:** `next-themes` available.
- **Guidelines:** [src/guidelines/Guidelines.md](../src/guidelines/Guidelines.md).
- **Naming:** feature components `PascalCase.tsx`; primitives `kebab-case.tsx`.

## Supporting Frontend Modules (non-visual)

| Module | Purpose |
| --- | --- |
| [services/api.ts](../src/services/api.ts) | All server I/O + typed domain interfaces |
| [config/defaults.ts](../src/config/defaults.ts) | `APP_DEFAULTS`, `LOCATIONS`, `SUPPORTED_CURRENCIES` |
| [utils/calculations.ts](../src/utils/calculations.ts) | Client rate, margin, cost, effort formulas |
| [utils/modeConversion.ts](../src/utils/modeConversion.ts) | Weekly↔monthly allocation/phase conversion |
| [utils/phases.ts](../src/utils/phases.ts) | Phase parsing, default colors, period→phase lookup |
| [utils/clientRoleMapping.ts](../src/utils/clientRoleMapping.ts) | Role → client role (from `prisma/client_roles.json`) |

## Component Test Coverage

Colocated tests exist for `ResourcePlan`, `ResourceList`, and `RateCard`
(`*.test.tsx`), plus unit tests for `calculations` and `clientRoleMapping`. See
[development-guide.md](./development-guide.md#testing) for how to run them.
