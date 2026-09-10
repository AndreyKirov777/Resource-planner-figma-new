# WBS & Estimate Reconciliation Specification

## Purpose

A planner decomposes a project into an independent work-breakdown tree, estimates hours per discipline per leaf, and sees where that bottom-up estimate disagrees with the resource plan, without either side automatically syncing the other. The table UI went through two intermediate designs (a discipline-columns matrix, then a role-overlay redesign) before settling on the current per-role-column layout (`spec-wbs-role-columns`); only the current contract is normative here.

## Requirements

### Requirement: WBS data model & API
The system SHALL persist a self-referencing `WbsItem` tree with multi-disciplinary `WbsEstimate` hours per item, through five REST endpoints mirroring existing `ResourcePlan`/`Allocation` conventions. (was spec-wbs-1-data-model-api)

#### Scenario: Empty project returns an empty list, not 404
- **GIVEN** an empty project
- **WHEN** `GET /api/projects/:id/wbs` is called
- **THEN** it returns `[]`

#### Scenario: Deleting an item cascades to its subtree and estimates
- **GIVEN** a `WbsItem` with children and estimates
- **WHEN** it is deleted
- **THEN** all descendant items and all estimates under the whole subtree are gone

#### Scenario: Unknown discipline is rejected when the rate card is populated
- **GIVEN** the live rate card is populated
- **WHEN** an estimate is written with a `discipline` not in `GlobalRateCard`
- **THEN** the request is rejected with 400 and no row is written

### Requirement: WBS & estimate reconciliation (WHAT)
The system SHALL let a planner decompose the project into an independent work-breakdown tree, estimate hours per discipline (role optional), and see where that bottom-up estimate disagrees with the resource plan, with Unassigned and Unmapped buckets visible; hours live on leaves, parents are computed. (was spec-resource-planner CAP-11)

#### Scenario: Variance is reported per phase x discipline
- **GIVEN** a project with WBS estimates and resource-plan allocations sharing a phase and discipline
- **WHEN** the WBS tab is opened
- **THEN** the panel shows a variance for that phase x discipline pair equal to WBS hours minus plan hours

#### Scenario: Unmapped and Unassigned buckets are always visible
- **GIVEN** at least one resource-plan row with an unmapped role and one WBS item with no phase
- **WHEN** the panel renders
- **THEN** both buckets are visible and non-empty, and neither the WBS tree nor the plan's allocations are modified as a side effect

### Requirement: WBS reconciliation panel
The system SHALL present WBS-vs-plan variance as a compact health strip with bar-encoded rows and a pivoted phase x discipline heatmap, collapsed by default, surfacing non-empty gap buckets even while collapsed. (was spec-wbs-reconciliation-compact-panel)

#### Scenario: A matched plan shows no open issues
- **GIVEN** a project whose plan exactly matches its WBS
- **WHEN** the panel is expanded
- **THEN** no "Open issues" block is present and every chip renders in the muted clear style

#### Scenario: Gaps are visible without expanding
- **GIVEN** the panel is collapsed
- **WHEN** a gap bucket is non-empty
- **THEN** its chip is visible next to the trigger without expanding

#### Scenario: Delta cells still announce the underlying pair
- **GIVEN** a screen reader
- **WHEN** it reaches any delta-only cell
- **THEN** it announces the underlying WBS/plan pair, not just the delta

### Requirement: Structural editing (add, indent, outdent, delete)
The system SHALL let a planner restructure the tree via a row menu and matching keyboard shortcuts, rejecting any reparent that would create a cycle. (was spec-wbs-structure-edit)

#### Scenario: Row menu and shortcuts perform structural edits
- **GIVEN** a selected row and no open editor
- **WHEN** the user uses the row menu or the matching shortcut
- **THEN** add child, add sibling below, indent, outdent, and delete behave consistently, and the menu shows each shortcut

#### Scenario: An open field editor blocks structural mutation
- **GIVEN** a name, phase, or roles editor is open
- **WHEN** Enter, Tab, Escape, Delete, or Backspace is pressed
- **THEN** the editor handles the key and no structure mutation runs

### Requirement: Drag-and-drop reordering and reparenting
The system SHALL let a planner reorder and reparent WBS rows by dragging the outline column, snapping to before/after/child zones, with self- and descendant-drops rejected as no-ops. (was spec-wbs-drag-drop)

#### Scenario: Dropping on a row's middle band reparents as last child
- **GIVEN** a row dragged onto another row's middle band
- **WHEN** it is dropped
- **THEN** it becomes that row's last child (expanding the parent if collapsed) and the subtree stays attached

#### Scenario: Drop on self or a descendant is a no-op
- **GIVEN** a drop on self or on a descendant
- **WHEN** it is released
- **THEN** no writes run and the tree is unchanged

### Requirement: Per-role hour columns
The system SHALL render the WBS table with one column per resource-list role plus a computed TOTAL, editable only on leaves, with parent cells rolling up their children. (was spec-wbs-role-columns)

#### Scenario: Headers reflect the project's resource list
- **GIVEN** a resource list with roles SA, Dev Sr, Dev Md, QA
- **WHEN** the WBS table renders
- **THEN** headers are WBS, Task Description, Phase, TOTAL, SA, Dev Sr, Dev Md, QA

#### Scenario: TOTAL and parent rollups are computed
- **GIVEN** a leaf with hours 0/32/16/8 across role columns
- **WHEN** it is shown
- **THEN** TOTAL is 56 and every ancestor's role cells equal the sum of its children's

#### Scenario: Parent role cells are not editable
- **GIVEN** a parent row
- **WHEN** a role cell is clicked
- **THEN** no editor opens and no request is sent

#### Scenario: Editing a leaf's role cell replaces its estimates
- **GIVEN** a leaf role cell
- **WHEN** a valid number is typed and blurred
- **THEN** that item's estimates are replaced and TOTAL updates
