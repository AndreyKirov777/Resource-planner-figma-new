import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RateCard as RateCardType, ResourceList as ResourceListType } from '../services/api';
import {
  RolePair,
  EstimateCommitter,
  availableRoles,
  deriveDiscipline,
  formatHoursInput,
  pairDisplayName,
  pairKey,
  parseHours,
  rolesUseFreeText,
  sameHours,
  samePairs,
} from '../utils/wbsGrid';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

/**
 * Marks content that Glide's `ClickOutsideContainer` must ignore. It walks the
 * event target's ancestor chain looking for this class, so putting it on the
 * portaled Radix menu keeps a click on an option from dismissing the overlay
 * before `onValueChange` can fire. `Wbs.tsx` also passes `isOutsideClick` to
 * `DataEditor` as a second, independent guard.
 */
export const CLICK_OUTSIDE_IGNORE = 'click-outside-ignore';

/**
 * `index.html` gives `#portal` — the element Glide renders its overlay into —
 * `z-index: 1000`, and `position: fixed` makes it a stacking context. Radix
 * copies its content's computed z-index onto `[data-radix-popper-content-wrapper]`,
 * so this class is what lifts a menu opened inside an overlay above it instead
 * of painting it behind.
 */
export const OVERLAY_MENU_CLASS = `${CLICK_OUTSIDE_IGNORE} z-[1100]`;

/**
 * True when an event originated inside a portaled Radix menu.
 *
 * Radix portals its menu into `document.body`, but it is still a React portal
 * from the editor's own tree, so its key events bubble through React back into
 * the editor — and from there into Glide's overlay `onKeyDown`, which would
 * close the overlay on the very Enter/Escape meant for the menu. Editors use
 * this to leave menu-local keys entirely alone.
 */
export function isInsidePortaledMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(`[data-radix-popper-content-wrapper], .${CLICK_OUTSIDE_IGNORE}`) !== null;
}

/** One queued edit: the item's next full pair set, as a function of a basis. */
type PairMutator = (basis: RolePair[]) => RolePair[];

/**
 * `lastGood` with every still-live mutation replayed over it, pushed to state.
 *
 * A settling write usually reproduces exactly what is already displayed (its
 * own optimistic result), so the no-change case is skipped rather than
 * re-rendering the editor under the user on every successful save.
 */
function applyQueue(
  ref: React.MutableRefObject<RolePair[]>,
  set: (pairs: RolePair[]) => void,
  lastGood: RolePair[],
  queue: PairMutator[]
): void {
  const next = queue.reduce((pairs, mutate) => mutate(pairs), lastGood);
  if (samePairs(ref.current, next)) return;
  ref.current = next;
  set(next);
}

export interface RolesEditorProps {
  itemId: number;
  /** The item's server-backed pairs — the fallback merge basis. */
  pairs: RolePair[];
  resourceLists: ResourceListType[];
  rateCards: RateCardType[];
  /**
   * Created once by the grid and passed in. Never owned by this component: the
   * overlay unmounts on every close, so an editor-owned committer would reset
   * the per-item chain and reopen the lost-update race it exists to close.
   */
  committer: EstimateCommitter;
  /** Asks the grid to tear the overlay down. */
  onClose: () => void;
}

/**
 * The composite Roles cell's overlay editor: the item's whole role x hours set,
 * edited as a unit because each mutation persists the item's FULL estimate set.
 *
 * Glide's overlay is hostile to multi-field editing, so three rules shape this
 * component:
 *
 *  - Glide `preventDefault`s Enter and Tab in its own overlay `onKeyDown`, so
 *    focus never moves and no `blur` ever fires. A blur-only commit silently
 *    drops what the user typed. Enter, Tab, Done and blur all commit here, and
 *    the handler `stopPropagation()`s so Glide's key handling never runs.
 *  - An outside click unmounts the editor outright, so pending drafts are
 *    flushed from the unmount cleanup rather than dying silently. Escape is the
 *    one exception: it DISCARDS the in-progress draft, because it is an
 *    explicit user cancel rather than a silent loss.
 *  - Hours are a text input validated as a raw string: `<input type="number">`
 *    reports `''` for `1e`, `1.2.3`, `-` and pasted text alike, which would
 *    make unparseable input indistinguishable from a cleared field and persist
 *    it as `0`. Blank commits `0`; anything unparseable reverts, visibly.
 */
export function RolesEditor({ itemId, pairs, resourceLists, rateCards, committer, onClose }: RolesEditorProps) {
  // Seeded from the committer so an edit made moments ago on this same row —
  // still in flight, so not yet reflected in `pairs` — is not clobbered.
  const [committed, setCommitted] = useState<RolePair[]>(() => committer.basisFor(itemId, pairs));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newRole, setNewRole] = useState('');
  const [newHours, setNewHours] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Refs mirror state so every commit path reads the same, already-flushed set
  // — including the unmount cleanup, which runs after React stops applying
  // state updates to this component.
  const committedRef = useRef(committed);
  committedRef.current = committed;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  /** The last set the server actually accepted (or the seed) — the rollback target. */
  const lastGoodRef = useRef<RolePair[]>(committed);
  /** Edits queued or in flight, oldest first, each as a function of a basis. */
  const queueRef = useRef<PairMutator[]>([]);
  /** Serializes this editor's own writes so each payload is built when it is sent. */
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  /**
   * Queue one edit, expressed as a MUTATION rather than a finished set.
   *
   * Two overlapping writes made the finished-set version wrong in both
   * directions. Rolling back to "whatever was there when I started" undid a
   * newer edit that had already shipped, leaving the editor and the server
   * divergent under a message claiming the change was reverted; and when both
   * writes failed, the second rollback restored the FIRST one's rejected value
   * into local state, which the next full-set write would then resurrect.
   *
   * `createEstimateCommitter` closes the same hazard on its side by checking
   * that its pending entry is still its own before clearing it. The same idea
   * applies here: a write only ever owns its own contribution. Keeping the
   * queue of mutations lets both halves fall out of one rule — the committed
   * set is always `lastGood` with every still-live mutation replayed over it,
   * so a failure removes exactly its own change and nothing else. For the same
   * reason the payload is rebuilt from `lastGood` at SEND time: a write queued
   * behind one that turns out to be rejected must not carry that rejected
   * value to the server inside its own full-set replace.
   */
  const persist = useCallback(
    (mutate: PairMutator) => {
      queueRef.current = [...queueRef.current, mutate];
      applyQueue(committedRef, setCommitted, lastGoodRef.current, queueRef.current);

      const settle = (failed: boolean) => {
        queueRef.current = queueRef.current.filter((queued) => queued !== mutate);
        applyQueue(committedRef, setCommitted, lastGoodRef.current, queueRef.current);
        if (failed) setMessage('Saving failed. The change was reverted.');
      };

      const send = () => {
        const payload = mutate(lastGoodRef.current);
        return committer.commit(itemId, payload).then(
          () => {
            // Per-item commits settle in queue order, so this is always the
            // newest set the server has accepted.
            lastGoodRef.current = payload;
            settle(false);
          },
          () => settle(true)
        );
      };

      chainRef.current = chainRef.current.then(send, send);
    },
    [committer, itemId]
  );

  /**
   * Commit every uncommitted hours draft. Used by Enter, Tab, Done, blur and
   * the unmount cleanup — every path out of this editor except Escape, which
   * discards instead.
   */
  const flushDrafts = useCallback(() => {
    const pending = draftsRef.current;
    const keys = Object.keys(pending);
    if (keys.length === 0) return;

    const accepted = new Map<string, number>();
    let rejected: string | null = null;

    for (const key of keys) {
      const parsed = parseHours(pending[key]);
      if (!parsed.ok) {
        // Non-numeric reverts without a request, per the edge-case matrix.
        rejected = pending[key];
        continue;
      }
      accepted.set(key, parsed.hours);
    }

    draftsRef.current = {};
    setDrafts({});
    setMessage(rejected === null ? null : `"${rejected}" is not a valid number of hours. Reverted.`);
    if (accepted.size === 0) return;

    // A write here is a full delete-and-recreate of the item's estimates, so a
    // no-op edit must not issue one. Compare with a tolerance: hours are shown
    // rounded, so a stored 0.30000000000000004 reads as "0.3" and comes back
    // from the input as exactly 0.3 — `===` would call that a change.
    const changed = committedRef.current.some((pair) => {
      const hours = accepted.get(pairKey(pair));
      return hours !== undefined && !sameHours(pair.hours, hours);
    });
    if (!changed) return;

    persist((basis) =>
      basis.map((pair) => {
        const hours = accepted.get(pairKey(pair));
        return hours === undefined ? pair : { ...pair, hours };
      })
    );
  }, [persist]);

  /** Throw the in-progress drafts away — Escape's explicit cancel. */
  const discardDrafts = useCallback(() => {
    draftsRef.current = {};
    setDrafts({});
    setMessage(null);
  }, []);

  // Outside-click and any other unmount path still flush, so nothing typed is
  // lost without a word. `flushDrafts` reads refs, so running it from a
  // cleanup carries no stale-closure risk.
  const flushRef = useRef(flushDrafts);
  flushRef.current = flushDrafts;
  useEffect(() => () => flushRef.current(), []);

  const offeredRoles = availableRoles(resourceLists, committed, rateCards);
  /**
   * Free text is gated on BOTH the roster and the rate card being empty,
   * mirroring the server's `validWbsDisciplines` bypass. An empty roster with a
   * populated card must not open a typed input — `deriveDiscipline` would hand
   * the typed role back as the discipline and the server would 400.
   */
  const useFreeText = rolesUseFreeText(resourceLists, rateCards);
  /** Nothing left to pick for THIS item, and free text would not be accepted. */
  const exhausted = !useFreeText && offeredRoles.length === 0;

  function addPair() {
    flushDrafts();
    const current = committedRef.current;
    const role = newRole.trim();
    if (role === '') {
      setMessage('Pick a role first.');
      return;
    }
    if (current.some((pair) => pair.role === role)) {
      // Never silently overwrite an existing role's hours.
      setMessage(`"${role}" is already on this item. Edit its hours instead.`);
      return;
    }
    const parsed = parseHours(newHours);
    if (!parsed.ok) {
      setMessage(`"${newHours}" is not a valid number of hours.`);
      return;
    }
    const added: RolePair = {
      role,
      discipline: deriveDiscipline(role, rateCards),
      hours: parsed.hours,
    };
    setNewRole('');
    setNewHours('');
    setMessage(null);
    persist((basis) => [...basis, added]);
  }

  function removePair(key: string) {
    flushDrafts();
    setMessage(null);
    persist((basis) => basis.filter((pair) => pairKey(pair) !== key));
  }

  function closeWithFlush() {
    flushDrafts();
    onClose();
  }

  /** Escape: an explicit cancel, so the draft is discarded rather than saved. */
  function closeWithDiscard() {
    discardDrafts();
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Keys aimed at an open role menu belong to that menu, not to this editor
    // and certainly not to Glide's overlay handler behind it.
    //
    // NOT UNIT-TESTABLE: the harness never mounts Glide's real overlay, so a
    // probe deleting `stopPropagation()` passes. Verified manually — see the
    // manual checks in the spec's Verification section.
    if (isInsidePortaledMenu(event.target)) {
      event.stopPropagation();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      // Glide would preventDefault this and close the overlay from its own
      // handler; stop it here so a multi-pair edit can continue.
      event.preventDefault();
      event.stopPropagation();
      if (newRole.trim() !== '' || newHours.trim() !== '') addPair();
      else flushDrafts();
    } else if (event.key === 'Tab') {
      // Deliberately NOT prevented: commit, then let focus move naturally
      // between this editor's own controls.
      event.stopPropagation();
      flushDrafts();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeWithDiscard();
    }
  }

  return (
    <div className="min-w-[22rem] space-y-2 p-2" onKeyDown={onKeyDown} data-testid="roles-editor">
      {committed.length === 0 ? (
        <p className="text-muted-foreground text-sm">No roles yet.</p>
      ) : (
        <ul className="space-y-1">
          {committed.map((pair) => {
            const key = pairKey(pair);
            const name = pairDisplayName(pair);
            return (
              <li key={key} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm" title={`${name} (${pair.discipline})`}>
                  {name}
                </span>
                <Input
                  className="h-8 w-24 text-right"
                  inputMode="decimal"
                  aria-label={`Hours for ${name}`}
                  value={drafts[key] ?? formatHoursInput(pair.hours)}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={flushDrafts}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removePair(key)}
                  aria-label={`Remove ${name}`}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t pt-2">
        {exhausted ? (
          <p className="text-muted-foreground flex-1 text-sm" data-testid="roles-exhausted">
            No roles left to add.
          </p>
        ) : useFreeText ? (
          <Input
            className="h-8 flex-1"
            placeholder="Role"
            aria-label="New role name"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          />
        ) : (
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger className="h-8 flex-1" aria-label="New role">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            {/* Portaled into document.body: needs BOTH the ignore class (so the
                overlay survives the capture-phase mousedown) and a z-index
                above #portal's 1000 (so the menu is not painted behind it). */}
            <SelectContent className={OVERLAY_MENU_CLASS}>
              {offeredRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!exhausted && (
          <>
            <Input
              className="h-8 w-24 text-right"
              inputMode="decimal"
              placeholder="Hours"
              aria-label="New role hours"
              value={newHours}
              onChange={(e) => setNewHours(e.target.value)}
            />
            <Button size="sm" onClick={addPair}>
              Add
            </Button>
          </>
        )}
      </div>

      {message !== null && (
        <p className="text-destructive text-xs" role="status">
          {message}
        </p>
      )}

      <div className="flex justify-end border-t pt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={closeWithFlush}
          onKeyDown={(event) => {
            // Done is the last control in the overlay. Tabbing forward from it
            // moves focus out of an overlay that is still open, which the user
            // then has no way back into — so treat it as Done.
            if (event.key === 'Tab' && !event.shiftKey) {
              event.preventDefault();
              event.stopPropagation();
              closeWithFlush();
            }
          }}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

/** The Task Description cell's overlay editor: a plain, single-field rename box. */
export interface NameEditorProps {
  value: string;
  /** Mirrors each keystroke to Glide, so its own close paths commit the draft. */
  onDraftChange: (value: string) => void;
  /** Commit and close. `movement` is Glide's post-edit cursor movement. */
  onCommit: (value: string, movement: readonly [-1 | 0 | 1, -1 | 0 | 1]) => void;
  /** Close WITHOUT committing — Escape's explicit cancel. */
  onCancel: () => void;
}

export function NameEditor({ value, onDraftChange, onCommit, onCancel }: NameEditorProps) {
  const [text, setText] = useState(value);
  const doneRef = useRef(false);

  const commit = (movement: readonly [-1 | 0 | 1, -1 | 0 | 1]) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(text, movement);
  };

  // Escape discards. It also latches `doneRef`, so the blur that follows the
  // overlay tearing down cannot commit the cancelled draft after the fact.
  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  return (
    <input
      autoFocus
      className="h-8 w-full bg-transparent px-2 text-sm outline-none"
      aria-label="Task description"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onDraftChange(e.target.value);
      }}
      // Glide preventDefaults Enter/Tab in its own handler, so neither focus
      // movement nor a blur ever happens; commit explicitly on both keys.
      // Escape is the one key that discards, as an explicit user cancel.
      //
      // NOT UNIT-TESTABLE: `stopPropagation()` only matters against Glide's real
      // overlay handler, which the harness never mounts. Verified manually.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          commit([0, 1]);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          commit([e.shiftKey ? -1 : 1, 0]);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        }
      }}
      onBlur={() => commit([0, 0])}
    />
  );
}

// Radix Select items cannot carry an empty-string value, and the domain value
// for "no phase" is `null`, not `''`.
export const UNASSIGNED_PHASE_VALUE = '__unassigned__';

/** The Phase cell's overlay editor: the project's phases plus Unassigned. */
export interface PhaseEditorProps {
  /** The row's OWN phase (never an inherited or stale one) — always an option. */
  value: string | null;
  phaseOptions: string[];
  onCommit: (phaseName: string | null) => void;
  onClose: () => void;
}

export function PhaseEditor({ value, phaseOptions, onCommit, onClose }: PhaseEditorProps) {
  const doneRef = useRef(false);
  // `parsePhases` does not enforce unique names, and two options sharing one
  // would render duplicate `SelectItem`s under identical React keys.
  const options = Array.from(new Set(phaseOptions));

  return (
    <div
      className="min-w-[14rem] p-2"
      data-testid="phase-editor"
      onKeyDown={(event) => {
        // Menu-local keys (Enter to pick, Escape to close the menu) must never
        // reach Glide's overlay handler behind this editor.
        //
        // NOT UNIT-TESTABLE: the harness never mounts Glide's real overlay, so
        // a probe deleting `stopPropagation()` passes. Verified manually.
        if (isInsidePortaledMenu(event.target)) {
          event.stopPropagation();
          return;
        }
        if (event.key === 'Escape') {
          // Escape cancels: close without committing anything, and latch the
          // guard so a late `onValueChange` cannot commit after the cancel.
          event.preventDefault();
          event.stopPropagation();
          doneRef.current = true;
          onClose();
        }
      }}
    >
      <Select
        defaultOpen
        value={value ?? UNASSIGNED_PHASE_VALUE}
        onValueChange={(selected) => {
          if (doneRef.current) return;
          doneRef.current = true;
          onCommit(selected === UNASSIGNED_PHASE_VALUE ? null : selected);
        }}
      >
        <SelectTrigger className="h-8 w-full" aria-label="Phase">
          <SelectValue />
        </SelectTrigger>
        {/* Same two guards as the role picker — see OVERLAY_MENU_CLASS. */}
        <SelectContent className={OVERLAY_MENU_CLASS}>
          <SelectItem value={UNASSIGNED_PHASE_VALUE}>Unassigned</SelectItem>
          {options.map((phase) => (
            <SelectItem key={phase} value={phase}>
              {phase}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Radix Select items cannot carry an empty-string value; the domain value
// for "no link" is `null`, not `''`.
export const NO_ROADMAP_LINK_VALUE = '__none__';

/** The WBS-side Roadmap cell's overlay editor (CAP-5): the project's roadmap bars plus None. */
export interface RoadmapLinkEditorProps {
  /** This node's OWN direct link, or `null` — never an inherited one (that isn't this node's to clear). */
  value: number | null;
  options: { id: number; name: string }[];
  onCommit: (roadmapItemId: number | null) => void;
  onClose: () => void;
}

export function RoadmapLinkEditor({ value, options, onCommit, onClose }: RoadmapLinkEditorProps) {
  const doneRef = useRef(false);

  return (
    <div
      className="min-w-[14rem] p-2"
      data-testid="roadmap-link-editor"
      onKeyDown={(event) => {
        if (isInsidePortaledMenu(event.target)) {
          event.stopPropagation();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          doneRef.current = true;
          onClose();
        }
      }}
    >
      <Select
        defaultOpen
        value={value == null ? NO_ROADMAP_LINK_VALUE : String(value)}
        onValueChange={(selected) => {
          if (doneRef.current) return;
          doneRef.current = true;
          onCommit(selected === NO_ROADMAP_LINK_VALUE ? null : Number.parseInt(selected, 10));
        }}
      >
        <SelectTrigger className="h-8 w-full" aria-label="Roadmap">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={OVERLAY_MENU_CLASS}>
          <SelectItem value={NO_ROADMAP_LINK_VALUE}>None</SelectItem>
          {options.map((item) => (
            <SelectItem key={item.id} value={String(item.id)}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
