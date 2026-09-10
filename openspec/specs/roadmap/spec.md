# Project Roadmap Specification

## Purpose

A planner places WBS effort in time as a separate, flat roadmap of lanes, windows, and milestones (not a Gantt on WBS items), then sees coverage (WHAT vs WHEN) and per-period demand vs Resource Plan supply (WHEN vs WHO). This is a planning instrument; it does not track progress, baselines, or actuals.

Design reference companions, frozen: `docs/bmad-archive/specs/spec-roadmap/data-model.md` (schema, API, link inheritance, demand formulas), `docs/bmad-archive/specs/spec-roadmap/timeline-component.md` (chart geometry, pointer model, keyboard parity, performance budget), `docs/bmad-archive/specs/spec-roadmap/ux-reference.md` (binding interaction and visual decisions), `docs/bmad-archive/specs/spec-roadmap/delivery.md` (slice history), `docs/bmad-archive/specs/spec-roadmap/svar-integration.md` (superseded Gantt-library evaluation, audit trail only).

## Requirements

### Requirement: Roadmap tab
The system SHALL show a Roadmap tab beside WBS, rendering the project's workstreams on the same phases and periods the Resource Plan uses. (was spec-roadmap CAP-1) (was spec-resource-planner CAP-12)

#### Scenario: Roadmap renders lanes on the period timeline
- **GIVEN** a project with lanes and items
- **WHEN** the Roadmap tab opens
- **THEN** it renders lanes and their items on a period timeline with phase bands, and the WBS tab is unchanged apart from one optional column

#### Scenario: Empty roadmap offers a starting action
- **GIVEN** an empty roadmap
- **WHEN** the tab opens
- **THEN** an empty state offers "create from WBS" or "add lane"

### Requirement: Lanes, items and milestones
The system SHALL let a planner structure the roadmap as lanes holding windows (bars) and milestones, flat, with no nesting. (was spec-roadmap CAP-2)

#### Scenario: Lane and item CRUD persists
- **GIVEN** the roadmap
- **WHEN** lanes are created, renamed, reordered, or deleted, or items (name, lane, start period, duration, kind) are created or edited
- **THEN** the changes persist and survive reload; deleting a lane deletes its items after a confirmation stating how many

#### Scenario: An item cannot contain another item
- **GIVEN** the roadmap's flat structure
- **WHEN** an item is created
- **THEN** it cannot itself contain another item

### Requirement: Lane summary bars
The system SHALL show, for every non-empty lane, a summary bar spanning from the earliest to the latest item in that lane, carrying collapsed rollups of milestones and over-demand, and collapsible by click without any network request. (was spec-roadmap-lane-summary-bars)

#### Scenario: Lane bar spans its items exactly
- **GIVEN** a lane whose items run W3-W6 and W9-W12
- **WHEN** the roadmap renders
- **THEN** the lane row shows one summary bar from W3 to W12 whose edges match the first and last item bars to the pixel

#### Scenario: An empty or spread-only lane draws no bar
- **GIVEN** a lane with no items, or a lane holding only spread items
- **WHEN** the roadmap renders
- **THEN** no lane bar is drawn (a spread-only lane still shows its spans-project chip)

#### Scenario: Collapsed lane rolls up milestones and over-demand
- **GIVEN** a collapsed lane containing a milestone and an over-demand item
- **WHEN** it is collapsed
- **THEN** the lane bar shows the milestone tick and the amber stripe over exactly those periods; expanding it moves both back to the item rows

#### Scenario: Clicking a lane bar toggles collapse without a request
- **GIVEN** the user presses and releases the pointer on a lane bar without moving
- **WHEN** the gesture ends
- **THEN** the lane collapses or expands and no network request is made

#### Scenario: A lane bar cannot be dragged
- **GIVEN** a user attempts to drag a lane bar
- **WHEN** they move the pointer
- **THEN** nothing moves, no ghost appears, and no write is sent

### Requirement: Period timeline in the app's own units
The system SHALL show the roadmap in phases and periods, with calendar dates as a secondary label derived from `Project.startDate` when set. (was spec-roadmap CAP-3)

#### Scenario: Scale shows phase bands and period ordinals
- **GIVEN** a project without a start date
- **WHEN** the roadmap renders
- **THEN** phase bands render above period columns labelled with ordinals, and a non-blocking hint explains dates are unavailable

#### Scenario: Zoom and Fit operate on planning units
- **GIVEN** the timeline
- **WHEN** the user zooms or clicks Fit
- **THEN** zoom steps by planning unit rather than free pixels, and Fit frames the whole project

### Requirement: Direct manipulation, by pointer or keyboard
The system SHALL let a planner place, reshape, move, and reorder roadmap items by dragging or by an equivalent keyboard path, snapping to period boundaries and committing through the same code path either way. (was spec-roadmap CAP-4) (was spec-roadmap-vertical-drag)

#### Scenario: A drag snaps to period boundaries with a visible ghost
- **GIVEN** a bar being dragged
- **WHEN** the pointer moves
- **THEN** a ghost shows where it will land, and it snaps to period boundaries on release so no item starts mid-period; a failed write reverts visibly and offers single-operation undo via toast

#### Scenario: Reordering within or across lanes matches in both panes
- **GIVEN** two items in one lane
- **WHEN** the user drags either one past the other in the timeline or in the left grid
- **THEN** the order changes, both panes show the same insert line during the gesture, and the new order survives reload

#### Scenario: A combined lane, index, and window change is one write
- **GIVEN** a timeline drag that changes lane, index, and window at once
- **WHEN** it is dropped
- **THEN** exactly one request carries all three, and a rejected request leaves the stored roadmap byte-for-byte unchanged

#### Scenario: Keyboard reorder uses the same commit path
- **GIVEN** a keyboard-only user
- **WHEN** they press the reorder shortcut on a focused bar or grid row
- **THEN** the item moves one position within its lane through the same commit path the pointer uses

### Requirement: Scope linking between WBS and roadmap
The system SHALL let a planner link any WBS node, and its whole subtree, to at most one roadmap item, with a descendant's own link overriding its ancestor's for its own subtree. (was spec-roadmap CAP-5)

#### Scenario: A linked node carries its whole subtree
- **GIVEN** a WBS node linked to a roadmap item
- **WHEN** effort is attributed
- **THEN** the node's whole subtree is attributed to that item, except where a descendant has its own link, which wins for its own subtree

#### Scenario: Every leaf is attributed to exactly one item or none
- **GIVEN** the full WBS tree
- **WHEN** attribution runs
- **THEN** every leaf's hours are attributed to exactly one roadmap item or to none, editable from both the item editor's scope picker and the optional WBS Roadmap column

### Requirement: Bars carry effort, not status
The system SHALL show each bar's held effort and colour, and always paint the item's name on bars, spreads, and milestones. (was spec-roadmap CAP-6) (was spec-roadmap-bar-name-labels) (was spec-roadmap-milestone-timeline-labels) (was spec-roadmap-item-colors) (was spec-roadmap-unlinked-outline-switch)

#### Scenario: Bars show hours, FTE, and name; no progress affordance
- **GIVEN** a bar or spread
- **WHEN** it renders
- **THEN** it is labelled with the item name (including when empty-scope), and hours/FTE by role appear in the left grid and tooltip; no progress affordance exists anywhere

#### Scenario: Milestones show their name beside the diamond
- **GIVEN** a milestone
- **WHEN** the roadmap renders
- **THEN** its name is drawn immediately to the right of the diamond as a non-interactive sidecar label

#### Scenario: A picked colour applies to the fill and to PNG export
- **GIVEN** a bar with a planner-picked colour
- **WHEN** Unlinked is off
- **THEN** the bar fills that colour, and a PNG export of it uses the same hex in its canvas fill

#### Scenario: Unlinked switch governs unlinked-item paint only
- **GIVEN** an unlinked bar
- **WHEN** the Unlinked switch is on
- **THEN** it has a dashed outline and accent-coloured name; when off, it uses the filled paint and the grid still shows 0 h. A bar linked to a WBS node with no estimates is always filled, regardless of the switch

#### Scenario: Toggle state persists per project
- **GIVEN** Unlinked was turned off
- **WHEN** the same project remounts
- **THEN** it is still off; a never-toggled project defaults on, and a storage read failure defaults on with nothing surfaced to the user

### Requirement: Coverage reconciliation (WHAT vs WHEN)
The system SHALL report WBS effort with no effective roadmap item, roadmap items with no scope, and items whose window shares no period with their linked effort's phase. (was spec-roadmap CAP-7)

#### Scenario: Unplaced, empty, and mismatched categories are reported
- **GIVEN** a project with unplaced WBS effort, an empty-scope item, and a phase-mismatched item
- **WHEN** the reconciliation panel renders
- **THEN** it lists each in its own category, with unplaced hours shown as an absolute and a share of the total

### Requirement: Demand engine
The system SHALL derive demand per (role, period) from linked effort and roadmap windows, compare it with Resource Plan supply, and report unplaceable effort separately, such that demand plus unplaceable hours equals the WBS total. (was spec-roadmap CAP-8)

#### Scenario: Unplaced effort still contributes baseline demand
- **GIVEN** WBS effort with an effective phase but no roadmap item
- **WHEN** demand is computed
- **THEN** it contributes a baseline demand spread evenly over its effective phase

#### Scenario: Effort with neither an item nor a phase is unplaceable
- **GIVEN** WBS effort with neither a roadmap item nor an effective phase
- **WHEN** demand is computed
- **THEN** it is reported as unplaceable and excluded from per-period figures, while the sum of per-period demand plus unplaceable hours still equals the WBS total

### Requirement: Capacity on the timeline
The system SHALL show, on the timeline itself, which periods are over-committed and which have idle capacity, without leaving the roadmap. (was spec-roadmap CAP-9)

#### Scenario: Over-demand periods carry a warning stripe
- **GIVEN** a bar whose demand exceeds supply in some of its periods
- **WHEN** the roadmap renders
- **THEN** a warning stripe covers exactly those periods, and a per-period demand-vs-supply strip renders under the timeline, switchable between role and discipline

#### Scenario: Clicking a period reveals its contributing items
- **GIVEN** the load strip
- **WHEN** the user clicks a period
- **THEN** the items producing that period's demand are revealed

### Requirement: Reconciliation by period (WHEN vs WHO)
The system SHALL add a by-period roles x periods matrix of demand, supply, and variance to the reconciliation panel, agreeing cell-for-cell with the load strip and bar stripes. (was spec-roadmap CAP-10)

#### Scenario: By-period matrix renders even with an empty roadmap
- **GIVEN** an empty roadmap
- **WHEN** the reconciliation panel renders
- **THEN** the by-period section renders from the phase baseline, with numbers matching the load strip

### Requirement: Item editor beside the timeline
The system SHALL provide a side panel editor that compresses (not covers) the timeline, editing name, lane, kind, start period, duration, and linked scope, saving each field on blur. (was spec-roadmap CAP-11)

#### Scenario: Editor shows scope, demand, and feasibility
- **GIVEN** the item editor
- **WHEN** it is open
- **THEN** it shows total effort, demand in FTE by role, plan supply over the window, and feasible duration, and scope is chosen from a WBS tree picker showing hours, inherited state, and other items' ownership

#### Scenario: A failed save reverts the field
- **GIVEN** a field edited in the item editor
- **WHEN** the save fails
- **THEN** the field reverts and the failure reason is reported

### Requirement: Create a roadmap from the WBS
The system SHALL bootstrap a first roadmap from the WBS in one action: depth-0 nodes become lanes, depth-1 nodes become items linked to their subtrees, each windowed to its effective phase, previewed before anything is written. (was spec-roadmap CAP-12)

#### Scenario: Bootstrap previews before writing
- **GIVEN** an empty roadmap
- **WHEN** the bootstrap runs
- **THEN** the result is previewed before anything is written, and a one-level WBS tree yields one lane with depth-0 items

### Requirement: Draft a Resource Plan from the roadmap (frozen)
The system SHALL keep the "Draft plan from roadmap" toolbar entry unconditionally disabled, even though `buildDraftFromRoadmapLoad` and its draft-preview-apply flow are fully implemented; unfreezing is a deliberate future decision, not part of this contract. Frozen 2026-08-22. (was spec-roadmap CAP-13) (was spec-resource-planner CAP-13)

#### Scenario: Toolbar entry stays disabled regardless of demand
- **GIVEN** any roadmap state, including one with non-zero demand
- **WHEN** the roadmap toolbar renders
- **THEN** "Draft plan from roadmap" is disabled with a tooltip explaining it is temporarily disabled

### Requirement: Roadmap PNG export
The system SHALL let a planner export the roadmap as a PNG scoped to the grid, the timeline, or both, with a chosen background, containing no UI control labels. (was spec-roadmap-png-export)

#### Scenario: Export excludes UI chrome
- **GIVEN** any export scope
- **WHEN** the PNG is produced
- **THEN** it never contains control labels such as "Add lane", "Export PNG", "Lane bars", "Fullscreen", or "Load"

#### Scenario: Empty roadmap blocks export
- **GIVEN** a roadmap with no lanes
- **WHEN** export would run
- **THEN** no file downloads and the user is notified
