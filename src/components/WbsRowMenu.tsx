import React from 'react';
import { OVERLAY_MENU_CLASS } from './RolesEditor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { StructureAction, structureShortcutLabel } from '../utils/wbsGrid';

export interface WbsRowMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  x: number;
  y: number;
  canIndent: boolean;
  canOutdent: boolean;
  isMac: boolean;
  onAddChild: () => void;
  onAddSibling: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onDelete: () => void;
}

function Item({
  action,
  label,
  isMac,
  disabled,
  variant,
  onSelect,
}: {
  action: StructureAction;
  label: string;
  isMac: boolean;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem disabled={disabled} variant={variant} onSelect={onSelect}>
      {label}
      <DropdownMenuShortcut>{structureShortcutLabel(action, isMac)}</DropdownMenuShortcut>
    </DropdownMenuItem>
  );
}

export function WbsRowMenu({
  open,
  onOpenChange,
  x,
  y,
  canIndent,
  canOutdent,
  isMac,
  onAddChild,
  onAddSibling,
  onIndent,
  onOutdent,
  onDelete,
}: WbsRowMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <span
          data-testid="wbs-row-menu-anchor"
          className="pointer-events-none fixed h-0 w-0"
          style={{ left: x, top: y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-testid="wbs-row-menu"
        align="start"
        className={OVERLAY_MENU_CLASS}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Item action="addChild" label="Add child" isMac={isMac} onSelect={onAddChild} />
        <Item action="addSibling" label="Add sibling below" isMac={isMac} onSelect={onAddSibling} />
        <Item action="indent" label="Indent" isMac={isMac} disabled={!canIndent} onSelect={onIndent} />
        <Item action="outdent" label="Outdent" isMac={isMac} disabled={!canOutdent} onSelect={onOutdent} />
        <Item action="delete" label="Delete" isMac={isMac} variant="destructive" onSelect={onDelete} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
