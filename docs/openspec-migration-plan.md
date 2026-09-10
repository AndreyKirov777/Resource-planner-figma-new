# BMAD → OpenSpec migration plan

Written 2026-09-09 against commit `8e8eeb8` on `feat/wbs-schedule-gantt`. Status: **plan only, nothing executed.**

## Summary

Nothing is converted in place and nothing is deleted from `_bmad-output/`. The BMAD output tree stays exactly where it is, frozen and read-only, so every existing link into it (code comments, README, companion paths inside the specs) keeps working. OpenSpec is installed alongside, its `openspec/specs/` is seeded from the two live SPEC kernels, the BMAD tooling is removed last, and the first real feature goes through `/opsx:propose` as the acceptance test. Six phases, one branch, one commit per phase, every phase reversible with `git revert`.

## 1. What exists today

BMAD v6.11.0 (core + bmm + tea 1.23.3), installed 2026-06-30, last updated 2026-08-22, targeting Claude Code, Codex and Cursor.

| Path | What it is | Files | Fate |
|---|---|---|---|
| `_bmad/` | Installer config, `uv` python scripts, render cache | 73 (30 tracked) | Delete (phase 4) |
| `.claude/skills/bmad-*` | 61 skills for Claude Code | 970 tracked | Delete (phase 4) |
| `.agents/skills/bmad-*` | Same 61 skills for Codex/Cursor | 970 tracked | Delete (phase 4) |
| `AGENTS.md` | Project guidance inside `<!-- bmad:context -->` markers | 1 | Keep content, strip markers (phase 3) |
| `_bmad-output/project-context.md` | 50 binding conventions for agents | 1 | Keep in place; distilled into `openspec/config.yaml` |
| `_bmad-output/specs/spec-resource-planner/` | Umbrella SPEC kernel, CAP-1…12, reconciled to as-built 2026-08-27 | 2 | **Seed source** for `openspec/specs/` |
| `_bmad-output/specs/spec-roadmap/` | Roadmap SPEC kernel CAP-1…13 + companions (`data-model`, `timeline-component`, `ux-reference`, `delivery`, `svar-integration`, `kickoff-prompt`) | 8 | **Seed source**; companions stay as design reference |
| `_bmad-output/specs/spec-wbs-schedule/` | Superseded by spec-roadmap on 2026-08-21 | 6 | Freeze only, never convert |
| `_bmad-output/implementation-artifacts/spec-*.md` | 26 Quick-Dev/build specs (Intent, Boundaries, I/O matrix, Code Map, Tasks, Acceptance, Verification) | 26 | Freeze; their Acceptance Criteria are lifted into scenarios |
| `_bmad-output/implementation-artifacts/deferred-work.md` | Backlog: Goal 3, CAP-13 freeze, small review deferrals | 1 | Keep in place as the backlog |
| `_bmad-output/planning-artifacts/` | 2 sprint-change proposals, UX design folder with mockups | 12 | Freeze |
| `_bmad-output/test-artifacts/` | TEA traceability matrix, gate decision (FAIL on coverage), test designs | 7 | Freeze; gate rationale copied into the backlog |
| `docs/` | 2026-06-30 brownfield scan (stale) + `ai-resource-plan-generation-spec.md` (design of record) | 14 | Unchanged |

Hard links into `_bmad-output/` that must keep resolving: `server.ts:1374`, `server-validation.ts:236`, `prisma/schema.prisma:154` (all point at `spec-roadmap/data-model.md`), `README.md:228` (points at `project-context.md`). Leaving the tree in place satisfies all four with no edits.

Two implementation specs still say `planned` / `draft` (`spec-roadmap-lane-summary-bars`, `spec-wbs-role-columns`) but both are shipped in code. Set them to `done` before the freeze so the archive is honest.

No BMAD skills are installed globally in the home directory. `openspec` 1.6.0 is already installed globally; latest is 1.12.0 (2026-09-03, needs Node ≥ 20.19, local Node is 25).

## 2. What OpenSpec (1.12) expects

```
openspec/
  config.yaml                 # schema, inline context (≤50 KB), per-artifact rules
  specs/<capability>/spec.md  # current truth: ## Purpose, ## Requirements, ### Requirement:, #### Scenario:
  changes/<name>/             # one in-flight change: proposal.md, design.md, tasks.md, specs/<cap>/spec.md (deltas)
  changes/archive/YYYY-MM-DD-<name>/
```

- A requirement is one `SHALL`/`MUST` sentence, observable from outside the code, with at least one `#### Scenario:` in WHEN/THEN (or GIVEN/WHEN/THEN) bullets.
- Deltas use `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`; `archive` merges them into the main spec.
- Slash commands (core profile): `/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:update`. Expanded profile adds `/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:verify`, `/opsx:sync`, `/opsx:bulk-archive`, `/opsx:onboard`.
- Tool files: `.claude/skills/openspec-*` + `.claude/commands/opsx/*.md` (Claude Code), `.cursor/skills/openspec-*` + `.cursor/commands/opsx-*.md` (Cursor), `.agents/skills/openspec-*` (Codex). 1.x writes **nothing** into root `AGENTS.md` or `CLAUDE.md`, so BMAD and OpenSpec skills can coexist during the migration; prefixes never collide.
- Official brownfield advice: do not back-fill specs for code you are not changing, because they go stale. We deviate deliberately and only for the two kernels, because they were reconciled to the as-built product on 2026-08-27 and losing them is the one thing this migration must not do.

## 3. Mapping decisions

### 3.1 Artifact → home

| BMAD artifact | OpenSpec home | Conversion |
|---|---|---|
| SPEC kernel `Capabilities` (intent + success) | `openspec/specs/<cap>/spec.md` requirements + scenarios | Agent-assisted rewrite, one CAP at a time, tagged `(was <spec-folder> CAP-N)` |
| SPEC kernel `Constraints`, `Non-goals` | The relevant capability's `## Purpose` paragraph, or `config.yaml` `context:` when project-wide | Copy, trim |
| SPEC kernel `Assumptions`, `Open Questions` | `deferred-work.md` (already the backlog) | Append |
| Impl spec `Acceptance Criteria` (Given/When/Then) | Extra `#### Scenario:` blocks on the matching requirement | Near-verbatim |
| Impl spec `Intent`, `Boundaries`, `Code Map`, `Design Notes`, `Verification` | Nowhere; the code is the truth and these changes are done | Freeze only |
| Impl spec template discipline (Always / Ask First / Never, Code Map, typecheck before done) | `config.yaml` `rules:` per artifact | Rewrite as 4–6 rule lines |
| `project-context.md`, `AGENTS.md` block | `config.yaml` `context:` (distilled, ~2 KB) + path to the full 50 rules | Distill |
| `.memlog.md` decision logs | Git history + future archived `proposal.md` files | None; frozen |
| Roadmap companions (`data-model`, `timeline-component`, `ux-reference`, `delivery`) | Linked from `roadmap/spec.md` `## Purpose` | None |
| `spec-wbs-schedule/` | Nothing | Superseded; never seed from it |
| Sprint change proposals, UX designs, TEA test artifacts | Frozen history | None |

### 3.2 Capability folders

Nine folders, grouped by domain as OpenSpec recommends. Seed sources in brackets.

| `openspec/specs/…` | Seeded from |
|---|---|
| `project-settings/` | umbrella CAP-1 (lifecycle & settings), CAP-7 (weekly / monthly) |
| `resource-plan/` | umbrella CAP-2, CAP-3, CAP-4; scenarios from `spec-planning-table-column-visibility`, `spec-fix-margin-on-currency-change`, `spec-daily-exchange-rates` |
| `rate-card/` | umbrella CAP-5 |
| `resource-list/` | umbrella CAP-6; `spec-wbs-roles-from-resource-list` |
| `client-view/` | umbrella CAP-8; `spec-client-view-png-export` |
| `export-import/` | umbrella CAP-9 (schemaVersion 4); `spec-wbs-4-export-import` |
| `ai-plan-generation/` | umbrella CAP-10; `spec-ai-llm-seam`, `spec-1b-…`, `spec-2-…`. Goal 3 is **not** built, so it stays out of the spec and in the backlog |
| `wbs/` | umbrella CAP-11; `spec-wbs-1/2/2r/3`, `spec-wbs-drag-drop`, `spec-wbs-structure-edit`, `spec-wbs-role-columns`, `spec-wbs-reconciliation-compact-panel` |
| `roadmap/` | spec-roadmap CAP-1…13; all `spec-roadmap-*` impl specs. CAP-13 is specified as-built: the button exists and is disabled |

Split `roadmap/` into `roadmap/` and `roadmap-capacity/` (CAP-8…10) only if the file passes ~15 requirements.

### 3.3 What has no OpenSpec equivalent

| Lost | Mitigation |
|---|---|
| Memlog-derived kernels (append-only decision log → rendered SPEC) | Decisions now live in each change's `proposal.md`, archived with a date. Old memlogs stay readable in the frozen tree |
| TEA workflows: traceability matrix, release gate, test design, ATDD | Copy the gate's concrete gaps (mode conversion, project copy, generate-plan HTTP/UI, client-view chrome) into `deferred-work.md` as a test-debt entry. Coverage tooling is `vitest --coverage`, already installed |
| Agent personas, party mode, advanced elicitation, deep recon | Dropped. `/opsx:explore` covers the pre-planning conversation |
| `bmad-build` review loop (edge-case hunter, verification gap) | `/opsx:verify` plus the built-in `/code-review` and `/simplify` skills |
| Code Map in every spec | `rules.design: "List every file to touch, annotated with its role"` |

## 4. Phases

Work on a branch cut from `feat/wbs-schedule-gantt` (main is ~120 commits behind and is not the base). Do not start a BMAD workflow after phase 0.

### Phase 0 — Prepare

1. Confirm no change is mid-flight: set the two stale statuses to `done`; `git status` clean.
2. `git checkout -b chore/openspec-migration`.
3. `npm install -g @fission-ai/openspec@latest` → `openspec --version` prints 1.12.x.

Done when: branch exists, CLI is current.

### Phase 1 — Install OpenSpec alongside BMAD

```
openspec init --tools claude,cursor,codex
openspec config profile        # pick "custom" and enable verify, sync, onboard
openspec update
```

Then author `openspec/config.yaml`. Draft:

```yaml
schema: spec-driven

context: |
  Resource Planner: staffing plans with cost, effort and margin. React 18 + Vite + TypeScript
  SPA over a single-file Express 5 + Prisma API on SQLite. Three layers: WBS (what), Roadmap
  (when), Resource Plan (who).
  Full binding conventions (50 rules): _bmad-output/project-context.md. Frozen BMAD history:
  _bmad-output/ (read-only). Backlog: _bmad-output/implementation-artifacts/deferred-work.md.
  Every REST endpoint is in server.ts; its Zod schema in server-validation.ts, all .strict().
  Reach the API only through src/services/api.ts. Never hand-edit src/generated/prisma.
  npm run typecheck must pass before work is called done; npm run build does not type-check.
  Integration tests: await isolateTestDb('<unique>') before importing ./server.

rules:
  proposal:
    - State Never (out of scope) and Ask First (needs a human decision) boundaries explicitly
  specs:
    - One SHALL per requirement; GIVEN/WHEN/THEN scenarios; keep the (was … CAP-N) tag when editing a seeded requirement
  design:
    - List every file to touch, annotated with its role; name read-only files too
  tasks:
    - One task per file where possible; include a typecheck task and a focused-test task
    - Docs task: update the affected openspec/specs delta, never the frozen _bmad-output tree

operations:
  apply:
    guidance:
      - Run the focused vitest files first, then npm run typecheck
```

Verify: `/opsx:propose` appears in Claude Code; `openspec validate --all` passes on the empty tree; `bmad-*` skills still load. Commit.

### Phase 2 — Seed `openspec/specs/` from the kernels

Per capability folder in §3.2, in an agent session (Claude Code, with the two SPEC.md files and the listed impl specs as input):

1. For each CAP: write `### Requirement: <title>` with one SHALL sentence from the intent, ending with the tag `(was spec-resource-planner CAP-11)` or `(was spec-roadmap CAP-6)`.
2. Turn the CAP's success line into the first scenario. Lift Acceptance Criteria from the listed impl specs as further scenarios, near-verbatim.
3. A CAP whose success line has several independent clauses becomes several requirements; keep the tag on each.
4. `## Purpose` holds the CAP's constraints and non-goals, plus links to any companion (`_bmad-output/specs/spec-roadmap/data-model.md` and friends).
5. Run `openspec validate --specs --strict` and fix until clean.

Then run the preservation check in §5. Commit once per folder or once at the end.

### Phase 3 — Freeze the BMAD tree and repoint guidance

1. Add `_bmad-output/README.md`:

   > Frozen 2026-09-DD. BMAD Method output, kept verbatim as history. Current requirements live in `openspec/specs/`; new work goes through `/opsx:propose`. Do not edit files here; `deferred-work.md` is the only file that still changes.

2. Append to `deferred-work.md`: the TEA gate's concrete test gaps, and the umbrella SPEC's open questions that are still open.
3. `AGENTS.md`: delete the two `<!-- bmad:context -->` marker lines, keep the content, change "BMad planning artifacts in `_bmad-output/`" to a short workflow paragraph: specs in `openspec/specs/` are current truth, propose before code, archive on merge, `_bmad-output/` is frozen history.
4. `README.md:228` keeps its link; the file did not move.

Commit.

### Phase 4 — Remove BMAD tooling

```
git rm -r -q _bmad .claude/skills/bmad-* .agents/skills/bmad-*
rm -rf _bmad .claude/skills/bmad-* .agents/skills/bmad-*    # sweeps the untracked Finder " 2" copies
grep -rn "_bmad/" --include=*.md --include=*.ts --include=*.toml . | grep -v node_modules | grep -v "^./_bmad-output/"
```

The grep must print nothing (references into the removed installer). `uv` is no longer needed by the repo. Commit.

### Phase 5 — Prove the loop with one real change

Pick the smallest open item from `deferred-work.md` (the WBS-4 "D6 plan-side role constraint" is the natural one) and run it end to end:

```
/opsx:propose wbs-role-constraint-plan-side
/opsx:apply
/opsx:verify
/opsx:archive
```

Done when: the change lands in `openspec/changes/archive/`, `openspec validate --all --strict` passes, and the `wbs/` spec shows the merged delta. Open the PR to `feat/wbs-schedule-gantt`.

## 5. Preservation check

One script; it fails if any capability id from a live kernel is missing from the seeded specs or if the specs do not validate.

```bash
#!/usr/bin/env bash
set -e
for s in spec-resource-planner spec-roadmap; do
  for c in $(grep -oE 'CAP-[0-9]+' "_bmad-output/specs/$s/SPEC.md" | sort -u); do
    grep -rq "was $s $c)" openspec/specs || { echo "MISSING $s $c"; exit 1; }
  done
done
openspec validate --specs --strict
echo "preservation OK"
```

Save it as `scripts/check-openspec-seed.sh`; delete it after the first archived change if it is not worth keeping.

## 6. Rollback

- Phases 1–3 add files only. `git revert` the phase commit.
- Phase 4 is one commit; revert restores every skill and `_bmad/`. Reinstalling from scratch is `npx bmad-method install` with the same answers (`_bmad/config.toml` is in git history).
- `_bmad-output/` is never modified except the added README and the backlog append.

## 7. Decisions still open

1. **Keep `_bmad-output/` name or rename to `docs/bmad-archive/`?** Recommendation: keep. A rename breaks the `../../../docs/…` and `../../src/…` relative links inside the frozen specs and the three code comments. Revisit only when the roadmap data-model doc is rewritten as an OpenSpec design.
2. **Seed all nine folders or only `wbs/` and `roadmap/`?** Recommendation: all nine. The umbrella kernel was reconciled two weeks ago; the cost is one agent session, and it is the only way to honour "lose nothing".
3. **Keep the TEA skills for coverage gates?** Recommendation: no. They depend on `_bmad/` config and `uv` scripts, so keeping half of BMAD is more complexity than the gate is worth. The gate's findings are carried into the backlog.

## Sources

- OpenSpec repository: https://github.com/Fission-AI/OpenSpec
- Concepts and file formats: https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md
- CLI reference: https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md
- Slash commands: https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md
- Writing specs: https://github.com/Fission-AI/OpenSpec/blob/main/docs/writing-specs.md
- Existing projects (brownfield): https://github.com/Fission-AI/OpenSpec/blob/main/docs/existing-projects.md
- Configuration (`config.yaml`): https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md
- Supported tools and file destinations: https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md
- Legacy → OPSX migration guide: https://github.com/Fission-AI/OpenSpec/blob/main/docs/migration-guide.md
- Releases: https://github.com/Fission-AI/OpenSpec/releases
- BMAD Method repository: https://github.com/bmad-code-org/BMAD-METHOD
- Framework comparisons: https://reenbit.com/bmad-vs-spec-kit-vs-openspec-choosing-your-spec-driven-ai-framework/ and https://arceapps.com/blog/sdd-frameworks-analysis-spec-kit-openspec-bmad/
