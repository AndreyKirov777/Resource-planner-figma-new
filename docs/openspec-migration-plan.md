# BMAD → OpenSpec migration plan

Written 2026-09-09, revised 2026-09-10 after the three open decisions were settled. Written against commit `989e0bf` on `feat/wbs-schedule-gantt`. Status: **plan only, nothing executed.**

## Summary

BMAD's output tree is renamed to `docs/bmad-archive/`, frozen, and every reference to it repointed in the same commit, so no path dependency on `_bmad-output/` survives anywhere in the repo. OpenSpec is installed alongside, its `openspec/specs/` is seeded from the two live SPEC kernels into all nine capability folders, the BMAD tooling (including TEA) is removed, and the first real feature goes through `/opsx:propose` as the acceptance test. Six phases, one branch, one commit per phase, every phase reversible with `git revert`.

## Decisions (settled 2026-09-10)

1. **Rename `_bmad-output/` → `docs/bmad-archive/`.** Chosen over keeping the path, to leave no dependency on the BMAD-era name. This is the one phase with real mechanical work: 63 files move one directory deeper and ~16 files outside the tree point at it. Section 4, phase 3 does it in one scripted pass with a link checker.
2. **Seed all nine capability folders**, not just `wbs/` and `roadmap/`. The umbrella kernel was reconciled to the as-built product on 2026-08-27, so it is trustworthy input.
3. **Remove the TEA skills.** They depend on `_bmad/` config and `uv` scripts; keeping half of BMAD costs more than the gate is worth. The gate's concrete findings move to the backlog.

Consequence of decision 1 worth stating plainly: the archive is frozen in *content*, not byte-for-byte. Path strings inside it are rewritten once, during the move. No decision, requirement, or rationale text changes. `git mv` preserves history, so `git log --follow` still works on every file.

## 1. What exists today

BMAD v6.11.0 (core + bmm + tea 1.23.3), installed 2026-06-30, last updated 2026-08-22, targeting Claude Code, Codex and Cursor.

| Path | What it is | Files | Fate |
|---|---|---|---|
| `_bmad/` | Installer config, `uv` python scripts, render cache | 73 (30 tracked) | Delete (phase 4) |
| `.claude/skills/bmad-*` | 61 skills for Claude Code | 970 tracked | Delete (phase 4) |
| `.agents/skills/bmad-*` | Same 61 skills for Codex/Cursor | 970 tracked | Delete (phase 4) |
| `AGENTS.md` | Project guidance inside `<!-- bmad:context -->` markers | 1 | Keep content, strip markers, repoint (phase 3) |
| `_bmad-output/project-context.md` | 50 binding conventions for agents | 1 | Move; distilled into `openspec/config.yaml` |
| `_bmad-output/specs/spec-resource-planner/` | Umbrella SPEC kernel, CAP-1…12, reconciled to as-built 2026-08-27 | 2 | Move; **seed source** |
| `_bmad-output/specs/spec-roadmap/` | Roadmap SPEC kernel CAP-1…13 + companions (`data-model`, `timeline-component`, `ux-reference`, `delivery`, `svar-integration`, `kickoff-prompt`) | 8 | Move; **seed source**; companions stay as design reference |
| `_bmad-output/specs/spec-wbs-schedule/` | Superseded by spec-roadmap on 2026-08-21 | 6 | Move only, never convert |
| `_bmad-output/implementation-artifacts/spec-*.md` | 26 build specs (Intent, Boundaries, I/O matrix, Code Map, Tasks, Acceptance, Verification) | 26 | Move; Acceptance Criteria lifted into scenarios |
| `_bmad-output/implementation-artifacts/deferred-work.md` | Backlog: Goal 3, CAP-13 freeze, review deferrals | 1 | Move; stays the live backlog |
| `_bmad-output/planning-artifacts/` | 2 sprint-change proposals, UX designs + mockups | 12 | Move, freeze |
| `_bmad-output/test-artifacts/` | TEA traceability matrix, gate decision (FAIL on coverage), test designs | 7 | Move, freeze; gate findings copied to backlog |
| `docs/` | 2026-06-30 brownfield scan (stale) + `ai-resource-plan-generation-spec.md` (design of record) | 14 | Six files repointed (phase 3) |

Two implementation specs still say `planned` / `draft` (`spec-roadmap-lane-summary-bars`, `spec-wbs-role-columns`) but both are shipped in code. Set them to `done` before the freeze so the archive is honest.

No BMAD skills are installed globally in the home directory. `openspec` 1.6.0 is installed globally; latest is 1.12.0 (2026-09-03, needs Node ≥ 20.19; local Node is 25).

## 2. Every reference that the rename touches

Verified by scan on 2026-09-10. This is the complete list; the phase-3 script covers all of it.

### 2.1 Inside the tree (63 files)

| Class | Pattern | Files | Rewrite |
|---|---|---|---|
| A. **Outbound** relative links | `](../…)` escaping the tree into `src/`, `server/`, `docs/`, root files | 21 | Add one `../` |
| A′. **Internal** relative links | `](../…)` from one archive folder to another (e.g. `implementation-artifacts/` → `specs/`) | ~8 | **Leave alone** — both ends move together |
| B. Config-style paths | `{project-root}/_bmad-output/…` in frontmatter `context:` | 24 | `_bmad-output` → `docs/bmad-archive` |
| C. Repo-root paths | bare `_bmad-output/…` in prose, frontmatter, and 2 JSON files | ~20 | Same |

**A and A′ look identical and must be treated differently.** A naive "add one `../` to every relative link" pass breaks 7 internal links — this was caught by dry-running the script (§5.3), not by reading it. The phase-3 script distinguishes them by resolution, not by counting `../`.

One thing that *is* safe to assume: no link combines classes (no `](../../_bmad-output/…` exists anywhere), so A/A′ and B/C never collide and can run as separate passes.

### 2.2 Outside the tree (16 files)

**Code comments — repo-root-relative strings, one rule:**

| File | Line |
|---|---|
| `server.ts` | 1377 |
| `server-validation.ts` | 238 |
| `prisma/schema.prisma` | 155 |
| `src/services/api.ts` | 167 |
| `src/utils/roadmap.ts` | 4 |
| `src/utils/roadmapLoad.ts` | 5 |
| `src/utils/roadmapOrder.ts` | 5 |
| `src/utils/wbs.ts` | 5 |

**Root files — repo-root-relative, same rule:** `README.md:228` (markdown link), `AGENTS.md:8` (prose).

**`docs/*` — the special case.** These currently escape upward with `../_bmad-output/`. After the move the target is a *sibling* directory, so the rule is different: `../_bmad-output/` → `bmad-archive/`. This is the easiest thing to get wrong.

| File | Lines |
|---|---|
| `docs/index.md` | 41, 65, 69 |
| `docs/architecture.md` | 159 |
| `docs/development-guide.md` | 6 |
| `docs/project-overview.md` | 53, 98 |
| `docs/source-tree-analysis.md` | 77 (tree diagram, hand-fix in phase 4 when `_bmad/` is deleted) |
| `docs/project-scan-report.json` | 26 (dated 2026-06-30 scan record — **leave as historical**) |

**Pre-existing damage, carried through untouched.** Neither item is caused by the migration and neither should be fixed by it:

- Six dead links to `src/components/RolesEditor.tsx` and its test, deleted 2026-08-29 in commit `47ec05c`. Detailed in §5.2, where they set the verification threshold.
- `test-artifacts/live-verification-results.json` is referenced twice but never existed. The link checker allowlists it.

## 3. Mapping decisions

### 3.1 Artifact → home

| BMAD artifact | OpenSpec home | Conversion |
|---|---|---|
| SPEC kernel `Capabilities` (intent + success) | `openspec/specs/<cap>/spec.md` requirements + scenarios | Agent-assisted rewrite, one CAP at a time, tagged `(was <spec-folder> CAP-N)` |
| SPEC kernel `Constraints`, `Non-goals` | The capability's `## Purpose`, or `config.yaml` `context:` when project-wide | Copy, trim |
| SPEC kernel `Assumptions`, `Open Questions` | `deferred-work.md` | Append |
| Impl spec `Acceptance Criteria` (Given/When/Then) | Extra `#### Scenario:` blocks | Near-verbatim |
| Impl spec `Intent`, `Boundaries`, `Code Map`, `Verification` | Nowhere; the code is the truth and these changes are done | Freeze only |
| Impl spec template discipline (Always / Ask First / Never, Code Map, typecheck before done) | `config.yaml` `rules:` per artifact | Rewrite as 4–6 rule lines |
| `project-context.md`, `AGENTS.md` block | `config.yaml` `context:` (distilled, ~2 KB) + path to the full 50 rules | Distill |
| `.memlog.md` decision logs | Git history + future archived `proposal.md` files | None; frozen |
| Roadmap companions | Linked from `roadmap/spec.md` `## Purpose` | None |
| `spec-wbs-schedule/` | Nothing | Superseded; never seed from it |
| Sprint proposals, UX designs, TEA artifacts | Frozen history | None |

### 3.2 The nine capability folders

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
| Memlog-derived kernels (append-only log → rendered SPEC) | Decisions live in each change's `proposal.md`, archived with a date. Old memlogs stay readable in the archive |
| TEA: traceability matrix, release gate, test design, ATDD | Copy the gate's concrete gaps (mode conversion, project copy, generate-plan HTTP/UI, client-view chrome) into `deferred-work.md` as a test-debt entry. Coverage tooling is `vitest --coverage`, already installed |
| Agent personas, party mode, elicitation, deep recon | Dropped. `/opsx:explore` covers pre-planning conversation |
| `bmad-build` review loop | `/opsx:verify` plus the built-in `/code-review` and `/simplify` skills |
| Code Map in every spec | `rules.design: "List every file to touch, annotated with its role"` |

## 4. Phases

Branch from `feat/wbs-schedule-gantt` (main is ~120 commits behind and is not the base). Do not start a BMAD workflow after phase 0.

### Phase 0 — Prepare

1. Set the two stale statuses to `done`; confirm `git status` clean.
2. `git checkout -b chore/openspec-migration`
3. `npm install -g @fission-ai/openspec@latest` → `openspec --version` prints 1.12.x.

### Phase 1 — Install OpenSpec alongside BMAD

```
openspec init --tools claude,cursor,codex
openspec config profile        # pick "custom" to enable verify, sync, onboard
openspec update
```

Then author `openspec/config.yaml`:

```yaml
schema: spec-driven

context: |
  Resource Planner: staffing plans with cost, effort and margin. React 18 + Vite + TypeScript
  SPA over a single-file Express 5 + Prisma API on SQLite. Three layers: WBS (what), Roadmap
  (when), Resource Plan (who).
  Full binding conventions (50 rules): docs/bmad-archive/project-context.md.
  Frozen pre-OpenSpec history: docs/bmad-archive/ (read-only).
  Backlog: docs/bmad-archive/implementation-artifacts/deferred-work.md.
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
    - Docs task: update the affected openspec/specs delta, never the frozen archive

operations:
  apply:
    guidance:
      - Run the focused vitest files first, then npm run typecheck
```

Verify: `/opsx:propose` appears in Claude Code; `openspec validate --all` passes; `bmad-*` skills still load. Commit.

### Phase 2 — Seed `openspec/specs/` from the kernels

Per capability folder in §3.2, in an agent session with the two SPEC.md files and the listed impl specs as input:

1. For each CAP: write `### Requirement: <title>` with one SHALL sentence from the intent, ending with the tag `(was spec-resource-planner CAP-11)` or `(was spec-roadmap CAP-6)`.
2. Turn the CAP's success line into the first scenario. Lift Acceptance Criteria from the listed impl specs as further scenarios, near-verbatim.
3. A CAP whose success line has several independent clauses becomes several requirements; keep the tag on each.
4. `## Purpose` holds the CAP's constraints and non-goals, plus links to any companion.
5. `openspec validate --specs --strict` until clean.

Paths in this phase still say `_bmad-output/` — phase 3 has not run yet. Run the preservation check in §5. Commit.

### Phase 3 — Rename, freeze, repoint

One commit. Everything here is scripted; nothing is hand-edited except the two prose paragraphs at the end.

First save `scripts/fix-archive-links.pl`. It deepens only the links that escaped the archive, leaving internal ones untouched, by testing resolution instead of counting `../`:

```perl
#!/usr/bin/env perl
# Deepen only the links that escaped the archive.
#
#   - A link that still resolves from its file was internal (both ends moved
#     together) and is left alone.
#   - One that resolves with an extra ../ was outbound and gets it.
#   - Anything that resolves neither way was already broken before the move.
#   - Fenced code blocks are skipped: they quote text belonging to other files,
#     at other depths, and must stay verbatim.
use strict; use warnings;
use File::Basename qw(dirname);
my $changed = 0;
for my $f (@ARGV) {
    my $d = dirname($f);
    open my $in, '<', $f or die "$f: $!";
    my $src = do { local $/; <$in> }; close $in;
    my ($fence, $out) = (0, '');
    for my $line (split /^/, $src) {
        if ($line =~ /^\s*```/) { $fence = !$fence; $out .= $line; next }
        $line =~ s{\]\(([^)\s]+)\)}{
            my $t = $1;
            my ($p, $frag) = split(/#/, $t, 2);
            $frag = defined $frag ? "#$frag" : "";
            ($p =~ m{^\.\./} && ! -e "$d/$p" && -e "$d/../$p")
                ? "](../$p$frag)" : "]($t)"
        }ge unless $fence;
        $out .= $line;
    }
    next if $out eq $src;
    open my $o, '>', $f or die "$f: $!"; print $o $out; close $o;
    $changed++;
}
print "rewrote $changed file(s)\n";
```

The fence guard matters for exactly one line in the archive today — `planning-artifacts/sprint-change-proposal-2026-08-27.md:292` quotes another file's SUPERSEDED banner inside a code block, to show its before-and-after text. That quoted path is correct where it really lives, two directories away, and rewriting it would corrupt a historical quotation to fix a link nobody follows.

Then:

```bash
set -e

# 3a — move, preserving history
git mv _bmad-output docs/bmad-archive

# 3b — outbound links only; internal links untouched. Expect "rewrote 21 file(s)".
find docs/bmad-archive -name '*.md' -print0 \
  | xargs -0 perl scripts/fix-archive-links.pl

# 3c — inside the archive: repo-root and {project-root} paths.
#      One rule covers both forms.
grep -rl '_bmad-output' docs/bmad-archive \
  | xargs perl -pi -e 's{_bmad-output}{docs/bmad-archive}g'

# 3d — outside, repo-root-relative: code comments and root docs
grep -rl '_bmad-output' server.ts server-validation.ts prisma/schema.prisma src README.md AGENTS.md \
  | xargs perl -pi -e 's{_bmad-output}{docs/bmad-archive}g'

# 3e — docs/*: target is now a SIBLING, so the ../ form collapses
perl -pi -e 's{\.\./_bmad-output/}{bmad-archive/}g; s{_bmad-output}{bmad-archive}g' \
  docs/index.md docs/architecture.md docs/development-guide.md docs/project-overview.md

# docs/project-scan-report.json is a dated 2026-06-30 scan record — left as historical.
# docs/source-tree-analysis.md line 77 is a repo tree diagram — hand-fixed in phase 4.
```

Then, by hand:

1. Add `docs/bmad-archive/README.md`:

   > Frozen 2026-09-DD. BMAD Method output, kept as history. Current requirements live in `openspec/specs/`; new work goes through `/opsx:propose`. Do not edit files here. `implementation-artifacts/deferred-work.md` is the only file that still changes.

2. Append to `deferred-work.md`: the TEA gate's concrete test gaps, and the umbrella SPEC's still-open questions.
3. `AGENTS.md`: delete the two `<!-- bmad:context -->` marker lines, keep the content, and replace "BMad planning artifacts in `docs/bmad-archive/`" with a short workflow paragraph — specs in `openspec/specs/` are current truth, propose before code, archive on merge, `docs/bmad-archive/` is frozen history.
4. Add one line to `docs/index.md` pointing at the archive.

Verify with §5.2, then commit.

### Phase 4 — Remove BMAD tooling

```bash
git rm -r -q _bmad .claude/skills/bmad-* .agents/skills/bmad-*
rm -rf _bmad .claude/skills/bmad-* .agents/skills/bmad-*   # sweeps untracked Finder " 2" copies

# hand-fix the tree diagram now that _bmad/ is gone
#   docs/source-tree-analysis.md:77
```

This removes the TEA skills (decision 3) along with the rest. `uv` is no longer needed by the repo.

Check nothing references the deleted installer:

```bash
grep -rn '_bmad/' --include='*.md' --include='*.ts' --include='*.toml' . \
  | grep -v node_modules | grep -v '/bmad-archive/'
```

Must print nothing. Commit.

### Phase 5 — Prove the loop with one real change

Take the smallest open item from `deferred-work.md` — the WBS-4 "D6 plan-side role constraint" is the natural one — and run it end to end:

```
/opsx:propose wbs-role-constraint-plan-side
/opsx:apply
/opsx:verify
/opsx:archive
```

Done when the change lands in `openspec/changes/archive/`, `openspec validate --all --strict` passes, and the `wbs/` spec shows the merged delta. Open the PR to `feat/wbs-schedule-gantt`.

## 5. Verification

### 5.1 Preservation (after phase 2)

Fails if any capability id from a live kernel is missing from the seeded specs. Use the pre-rename paths in phase 2, the post-rename paths after.

```bash
#!/usr/bin/env bash
# scripts/check-openspec-seed.sh
set -e
ARCHIVE=${1:-docs/bmad-archive}
for s in spec-resource-planner spec-roadmap; do
  for c in $(grep -oE 'CAP-[0-9]+' "$ARCHIVE/specs/$s/SPEC.md" | sort -u); do
    grep -rq "was $s $c)" openspec/specs || { echo "MISSING $s $c"; exit 1; }
  done
done
openspec validate --specs --strict
echo "preservation OK"
```

### 5.2 Link integrity (after phase 3)

Two checks. The first proves the old name is gone, the second proves nothing broke.

```bash
# 1. no surviving reference to the old path.
#    Exclusions, all temporary or deliberate:
#      _bmad/ and the bmad-* skills   -> deleted in phase 4
#      docs/source-tree-analysis.md   -> tree diagram, hand-fixed in phase 4
#      docs/project-scan-report.json  -> dated 2026-06-30 scan record, left as history
#      this plan                      -> documents the old name on purpose
grep -rn '_bmad-output' . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=_bmad \
  --exclude=source-tree-analysis.md --exclude=project-scan-report.json \
  --exclude=openspec-migration-plan.md \
  | grep -v '/skills/bmad-' \
  && echo "STALE REFS ABOVE" && exit 1

# 2. every relative markdown link inside the archive still resolves.
#    Fenced blocks are skipped for the same reason the fixer skips them:
#    they quote other files' text, at other depths.
find docs/bmad-archive -name '*.md' | while read -r f; do
  d=$(dirname "$f")
  awk '/^[[:space:]]*```/ {fence=!fence; next} !fence' "$f" \
  | grep -oE '\]\([^)#]+' | sed 's/^](//' | while read -r t; do
      case "$t" in http*|'#'*|*'*'*|*live-verification-results*) continue;; esac
      [ -e "$d/$t" ] || echo "BROKEN $f -> $t"
    done
done | tee /tmp/after.txt; wc -l < /tmp/after.txt
```

**Check 2 must print exactly 6 lines, not zero.** The archive has 6 dead links today, before any migration, and they are all the same casualty: `src/components/RolesEditor.tsx` and its test, cited four times in `spec-wbs-2r-wbs-table-redesign.md` (lines 227, 233, 242, 289) and twice in `spec-wbs-roles-from-resource-list.md` (lines 108, 124). The component was added on 2026-08-13 by the WBS-2R redesign and deleted on 2026-08-29 by commit `47ec05c`, "Add WBS resource role columns", when role editing moved into the WBS grid. Nothing replaced it under a new name.

Leave them dead. Both specs are `status: done` and describe a component that existed when the work shipped; repointing them would falsify the record. The fixer leaves any link alone when it resolves neither way, so they pass through unchanged. Anything above 6 is damage from the move.

Rerun check 1 after phase 4; it should then pass with only the scan-report and this plan excluded.

Also spot-check `docs/index.md` and `README.md` in a markdown preview — they are the human entry points into the archive.

Delete both scripts after the first archived change if they are not worth keeping.

### 5.3 Dry-run result (2026-09-10)

Phase 3 was rehearsed before this plan was finalised, on a throwaway copy built with `git archive HEAD | tar -x -C <tmp>` (tracked files only, no `node_modules`). Findings:

- The first draft of the script — "add one `../` to every relative link" — doubled the reported breakage, from 7 to 14 on the fence-blind checker then in use. All 7 new breakages were internal cross-folder links. That is what produced rule A′ in §2.1 and the resolution-based fixer.
- With the corrected fixer: 21 files rewritten, broken-link count unchanged before and after, same set.
- Spot-checked correct after the move: outbound code links (`../../../server/llm/config.ts` resolves), `{project-root}/` frontmatter paths, both JSON files under `test-artifacts/`, the eight source-code comments, the `README.md` link, and the `docs/*` sibling collapse (`../_bmad-output/project-context.md` → `bmad-archive/project-context.md`).
- **The baseline was then re-checked and is 6, not 7.** The seventh was a false positive in the checker, which scanned fenced code blocks: `sprint-change-proposal-2026-08-27.md:292` quotes another file's banner inside a fence, and that quoted path is correct at the quoted file's depth, two directories away. Both the checker and the fixer now skip fenced blocks. Re-verified end to end: 21 files rewritten, 6 dead links before and after, quoted banner byte-identical.

Only one relative link sits inside a fenced block in the whole archive today, and it happens to resolve neither way, so the fixer would have left it alone regardless. The guard is insurance for the re-run, not a fix for present damage.

Rehearse it again the same way before running it for real, since the repo will have moved on.

## 6. Rollback

- Phases 1–2 add files only. `git revert` the phase commit.
- Phase 3 is one commit containing the rename and every repoint. `git revert` restores `_bmad-output/` and all old paths together, which is exactly why the rename and the repoint must not be split across commits.
- Phase 4 is one commit; revert restores every skill and `_bmad/`. Reinstalling from scratch is `npx bmad-method install` with the same answers (`_bmad/config.toml` is in git history).
- Archive content is never edited beyond the path strings in phase 3 and the backlog append.

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
