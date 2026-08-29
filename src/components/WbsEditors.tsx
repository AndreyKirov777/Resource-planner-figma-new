import React, { useRef, useState } from 'react';
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
