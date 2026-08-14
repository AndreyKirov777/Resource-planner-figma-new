# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

## [0.3.2] - 2026-08-14

### Added
- Project JSON export/import now includes the WBS tree and its estimates (`schemaVersion` 3). Older v2 files still import with an empty WBS.

### Fixed
- Adding a WBS item now selects the new row (and focuses the grid on it) instead of dropping the selection when the table updates.
- Deleting a WBS item now selects the row above (or the next surviving row if the deleted item was first).

## [0.3.1] - 2026-08-14

### Added
- WBS structure editing from the table: a per-row menu and matching keyboard shortcuts (Enter sibling, ⌘/Ctrl+Enter child, Tab indent, Shift+Tab outdent, Delete/Backspace). Indent and outdent reparent items; the API rejects a `parentId` that would create a cycle.

### Changed
- Once a WBS has rows, Add child / Delete / Add root item leave the header toolbar. Structure edits go through the row menu and shortcuts; **Add root item** remains only for an empty WBS. A one-line hint by the heading lists the keys.
- WBS Roles picker now offers distinct roles from the project's Resource List (discipline still comes from the rate card).

## [0.3.0] - 2026-08-13

### Changed
- Redesigned the WBS page as a flat five-column grid (WBS · Task Description · Phase · Roles · Hours), replacing the dynamically-widening discipline × hours matrix. Phase now inherits down the tree, and roles/hours are edited as role×hours pairs with the discipline derived from the rate card.

## [0.2.0] - 2026-08-13

### Added
- Work Breakdown Structure (WBS) tab: decompose a project into a task tree, estimate effort per discipline, and see a phase × discipline variance report against the resource plan (gaps surfaced as "Unassigned WBS hours" and "Unmapped plan roles").

## [0.1.0] - 2026-08-12

### Added
- Baseline Resource Planning Application (React + Vite frontend, Express + Prisma API, SQLite)
