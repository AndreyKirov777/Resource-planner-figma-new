/**
 * CAP-12: preview a roadmap bootstrapped from the WBS before writing
 * anything. `Lane · Item · Hours · Window · Phase`, flagged rows in amber.
 */
import { BootstrapPreview } from '../../utils/roadmap';
import { formatHours } from '../../utils/wbsGrid';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

interface BootstrapDialogProps {
  open: boolean;
  preview: BootstrapPreview | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BootstrapDialog({ open, preview, onCancel, onConfirm }: BootstrapDialogProps) {
  const laneCount = preview?.lanes.length ?? 0;
  const itemCount = preview?.lanes.reduce((sum, l) => sum + l.items.length, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-2xl" data-testid="bootstrap-dialog">
        <DialogHeader>
          <DialogTitle>Create roadmap from WBS</DialogTitle>
          <DialogDescription>
            Nothing is written until you confirm. Rows marked in amber have no effective phase and will span the
            whole project.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lane</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Phase</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview?.lanes.flatMap((lane) =>
                lane.items.map((item, idx) => (
                  <TableRow key={`${lane.name}-${idx}`} className={item.flagged ? 'bg-amber-50 dark:bg-amber-950/30' : undefined}>
                    <TableCell>{idx === 0 ? lane.name : ''}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatHours(item.hours)}</TableCell>
                    <TableCell>
                      W{item.startPeriod}
                      {item.periodCount > 1 ? `–${item.startPeriod + item.periodCount - 1}` : ''}
                    </TableCell>
                    <TableCell className={item.flagged ? 'text-amber-700 dark:text-amber-400' : undefined}>
                      {item.flagged ? 'spans project — no phase' : item.phaseName}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            Create {laneCount} lane{laneCount === 1 ? '' : 's'}, {itemCount} item{itemCount === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
