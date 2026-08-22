/**
 * "Add bar" / "Add milestone" / "Add spread": name + lane, in a modal —
 * replaces `window.prompt('Item name')`. Kind is fixed by which button
 * opened the dialog; start/duration stay editable afterwards in
 * `RoadmapEditorPanel`.
 */
import { useEffect, useState } from 'react';
import { RoadmapItemKind, RoadmapLaneWithItems } from '../../services/api';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface AddItemDialogProps {
  open: boolean;
  kind: RoadmapItemKind;
  lanes: RoadmapLaneWithItems[];
  defaultLaneId: number | undefined;
  onCancel: () => void;
  onConfirm: (data: { name: string; laneId: number }) => void;
}

const KIND_LABEL: Record<RoadmapItemKind, string> = {
  bar: 'bar',
  milestone: 'milestone',
  spread: 'spread',
};

export function AddItemDialog({ open, kind, lanes, defaultLaneId, onCancel, onConfirm }: AddItemDialogProps) {
  const label = KIND_LABEL[kind];
  const [name, setName] = useState(`New ${label}`);
  const [laneId, setLaneId] = useState<number | undefined>(defaultLaneId);

  useEffect(() => {
    if (open) {
      setName(`New ${label}`);
      setLaneId(defaultLaneId);
    }
  }, [open, defaultLaneId, label]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && laneId !== undefined;

  function submit() {
    if (!canSubmit || laneId === undefined) return;
    onConfirm({ name: trimmed, laneId });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add {label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="add-item-name">Name</Label>
          <Input
            id="add-item-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Lane</Label>
          <Select value={laneId !== undefined ? String(laneId) : undefined} onValueChange={(v) => setLaneId(Number.parseInt(v, 10))}>
            <SelectTrigger aria-label="Lane">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lanes.map((lane) => (
                <SelectItem key={lane.id} value={String(lane.id)}>
                  {lane.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Add {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
