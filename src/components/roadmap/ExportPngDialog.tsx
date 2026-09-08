/**
 * Export Roadmap PNG options: scope (table+timeline | timeline only) and
 * background (white | transparent). Chart-only canvas download — no UI chrome.
 */
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import type { RoadmapPngBackground, RoadmapPngScope } from '../../utils/roadmapPng';

interface ExportPngDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (options: { scope: RoadmapPngScope; background: RoadmapPngBackground }) => void;
}

export function ExportPngDialog({ open, onCancel, onConfirm }: ExportPngDialogProps) {
  const [scope, setScope] = useState<RoadmapPngScope>('table-and-timeline');
  const [background, setBackground] = useState<RoadmapPngBackground>('white');

  useEffect(() => {
    if (open) {
      setScope('table-and-timeline');
      setBackground('white');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm" data-testid="roadmap-export-png-dialog">
        <DialogHeader>
          <DialogTitle>Export PNG</DialogTitle>
          <DialogDescription>
            Downloads the chart only — no toolbar, Load strip, or editor.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Content</legend>
          <RadioOption
            name="roadmap-png-scope"
            value="table-and-timeline"
            checked={scope === 'table-and-timeline'}
            onChange={() => setScope('table-and-timeline')}
            label="Table + roadmap"
          />
          <RadioOption
            name="roadmap-png-scope"
            value="timeline-only"
            checked={scope === 'timeline-only'}
            onChange={() => setScope('timeline-only')}
            label="Roadmap only"
          />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Background</legend>
          <RadioOption
            name="roadmap-png-background"
            value="white"
            checked={background === 'white'}
            onChange={() => setBackground('white')}
            label="White"
          />
          <RadioOption
            name="roadmap-png-background"
            value="transparent"
            checked={background === 'transparent'}
            onChange={() => setBackground('transparent')}
            label="Transparent"
          />
        </fieldset>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            data-testid="roadmap-export-png-confirm"
            onClick={() => onConfirm({ scope, background })}
          >
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RadioOption({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  const id = `${name}-${value}`;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="accent-[#8f4f8f]"
      />
      {label}
    </label>
  );
}
