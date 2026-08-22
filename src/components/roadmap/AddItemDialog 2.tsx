/**
 * "Add item": name + lane, in a modal — replaces `window.prompt('Item name')`.
 * Kind/start/duration stay editable afterwards in `RoadmapEditorPanel`; the
 * item is created as a 1-period bar at period 1, same as before.
 */
import { useEffect, useState } from 'react';
import { RoadmapLaneWithItems } from '../../services/api';
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
  lanes: RoadmapLaneWithItems[];
  defaultLaneId: number | undefined;
  onCancel: () => void;
  onConfirm: (data: { name: string; laneId: number }) => void;
}

export function AddItemDialog({ open, lanes, defaultLaneId, onCancel, onConfirm }: AddItemDialogProps) {
  const [name, setName] = useState('New item');
  const [laneId, setLaneId] = useState<number | undefined>(defaultLaneId);

  useEffect(() => {
    if (open) {
      setName('New item');
      setLaneId(defaultLaneId);
    }
  }, [open, defaultLaneId]);

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
          <DialogTitle>Add item</DialogTitle>
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
            Add item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
