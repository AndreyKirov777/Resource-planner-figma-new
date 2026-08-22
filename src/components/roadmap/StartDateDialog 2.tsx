/**
 * "Set start date": a native date input in a modal — replaces
 * `window.prompt('Project start date (YYYY-MM-DD)')`. The `type="date"`
 * input guarantees the format, so no parsing/validation is needed here.
 */
import { useEffect, useState } from 'react';
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

interface StartDateDialogProps {
  open: boolean;
  value: string | null;
  onCancel: () => void;
  onConfirm: (next: string | null) => void;
}

export function StartDateDialog({ open, value, onCancel, onConfirm }: StartDateDialogProps) {
  const [date, setDate] = useState(value ?? '');

  useEffect(() => {
    if (open) setDate(value ?? '');
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set start date</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="start-date-input">Project start date</Label>
          <Input
            id="start-date-input"
            type="date"
            autoFocus
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {value !== null && (
            <Button variant="outline" onClick={() => onConfirm(null)}>
              Clear
            </Button>
          )}
          <Button onClick={() => onConfirm(date === '' ? null : date)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
