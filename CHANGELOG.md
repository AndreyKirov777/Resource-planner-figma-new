# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

## [0.3.0] - 2026-08-13

### Changed
- Redesigned the WBS page as a flat five-column grid (WBS · Task Description · Phase · Roles · Hours), replacing the dynamically-widening discipline × hours matrix. Phase now inherits down the tree, and roles/hours are edited as role×hours pairs with the discipline derived from the rate card.

## [0.2.0] - 2026-08-13

### Added
- Work Breakdown Structure (WBS) tab: decompose a project into a task tree, estimate effort per discipline, and see a phase × discipline variance report against the resource plan (gaps surfaced as "Unassigned WBS hours" and "Unmapped plan roles").

## [0.1.0] - 2026-08-12

### Added
- Baseline Resource Planning Application (React + Vite frontend, Express + Prisma API, SQLite)
