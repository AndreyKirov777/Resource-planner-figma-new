/**
 * The roadmap's left grid: `Lane / Item` (200px), `Hours` (64px), `FTE` (56px),
 * one row per `RoadmapRow` at the same 34px `ROW_HEIGHT` the timeline uses, so
 * the two stay aligned without a shared layout engine (`border-box` sizing on
 * both, per `timeline-component.md`'s column-grid contract).
 */
import { MoreVertical } from 'lucide-react';
import { RoadmapRow } from '../../utils/roadmap';
import { formatHours } from '../../utils/wbsGrid';
import { ROW_HEIGHT, HEADER_HEIGHT } from '../../utils/roadmapGeometry';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';

interface RoadmapGridProps {
  rows: RoadmapRow[];
  selectedItemId: number | null;
  onSelectItem: (id: number) => void;
  onToggleLane: (laneId: number) => void;
  onRequestRenameLane: (laneId: number) => void;
  onDeleteLane: (laneId: number) => void;
  onMoveLane: (laneId: number, direction: -1 | 1) => void;
  onEditItem: (itemId: number) => void;
  onDeleteItem: (itemId: number) => void;
  onMoveItem: (itemId: number, direction: -1 | 1) => void;
}

export function RoadmapGrid({
  rows,
  selectedItemId,
  onSelectItem,
  onToggleLane,
  onRequestRenameLane,
  onDeleteLane,
  onMoveLane,
  onEditItem,
  onDeleteItem,
  onMoveItem,
}: RoadmapGridProps) {
  return (
    <div className="w-[320px] flex-none border-r" data-testid="roadmap-grid">
      <div
        className="flex items-center border-b bg-muted/40 text-xs font-medium text-muted-foreground"
        style={{ height: HEADER_HEIGHT, boxSizing: 'border-box' }}
      >
        <div className="w-[200px] px-2">Lane / Item</div>
        <div className="w-[64px] px-2 text-right">Hours</div>
        <div className="w-[56px] px-2 text-right">FTE</div>
      </div>
      <div>
        {rows.map((row) => {
          const isLane = row.kind === 'lane';
          const isSelected = !isLane && row.id === selectedItemId;
          return (
            <div
              key={`${row.kind}-${row.id}`}
              data-testid={isLane ? `roadmap-grid-lane-${row.id}` : `roadmap-grid-item-${row.id}`}
              className={cn(
                'group flex items-center border-b text-sm',
                isLane && 'bg-[#f6f6f6] font-semibold dark:bg-[#1f1f1f]',
                isSelected && 'bg-accent/40'
              )}
              style={{ height: ROW_HEIGHT, boxSizing: 'border-box' }}
              onClick={() => (isLane ? onToggleLane(row.id) : onSelectItem(row.id))}
            >
              <div className="flex w-[200px] items-center gap-1 truncate px-2">
                {isLane && (
                  <span className="text-muted-foreground text-xs">{row.collapsed ? '▸' : '▾'}</span>
                )}
                <span className="truncate">{row.name}</span>
              </div>
              <div className="w-[64px] px-2 text-right tabular-nums">{formatHours(row.hours)}</div>
              <div className="w-[56px] px-2 text-right tabular-nums">{row.fte.toFixed(1)}</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mr-1 h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                    aria-label={isLane ? `${row.name} lane menu` : `${row.name} item menu`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {isLane ? (
                    <>
                      <DropdownMenuItem onClick={() => onRequestRenameLane(row.id)}>Rename</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveLane(row.id, -1)}>Move up</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveLane(row.id, 1)}>Move down</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => onDeleteLane(row.id)}>
                        Delete lane
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => onEditItem(row.id)}>Edit (Space)</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveItem(row.id, -1)}>Move up</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMoveItem(row.id, 1)}>Move down</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => onDeleteItem(row.id)}>
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
