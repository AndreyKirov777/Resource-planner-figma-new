import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Plus, Trash2, Search, X, ArrowLeft, FileSpreadsheet, CalendarClock } from 'lucide-react';
import * as ExcelJS from 'exceljs';
import { RateCard as RateCardType } from '../services/api';
import { getClientRoleFromRole } from '../utils/clientRoleMapping';
import { APP_DEFAULTS, LOCATIONS } from '../config/defaults';
import { GENERATE_PLAN_REGIONS } from '../utils/regions';
import { clientHourlyRate } from '../utils/calculations';

// The 9 rate-card regions: RateCard field, tab slug (activeRegionTab), the
// grid column header, and the resource-list location string. `LOCATIONS` and
// `GENERATE_PLAN_REGIONS` are declared in the same order (see utils/regions.ts)
// but their labels differ in punctuation for one entry ("Asia (ARM,KZ)" vs
// "Asia (ARM, KZ)") — zipped by index, not merged into a single label, to
// preserve both spellings exactly as they were before this table existed.
const REGION_FIELDS = LOCATIONS.map(({ slug, label: locationLabel }, i) => ({
  slug,
  field: GENERATE_PLAN_REGIONS[i].value,
  columnLabel: GENERATE_PLAN_REGIONS[i].label,
  locationLabel,
}));

/** Width that fits the header label plus sort icon and padding. */
function widthForHeader(headerName: string): number {
  return Math.max(56, headerName.length * 8 + 36);
}

// Import AG Grid styles
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

// Custom cell renderer component for the Actions column
const ActionsCellRenderer = (props: any) => {
  const [isClicked, setIsClicked] = useState(false);

  const addRateCard = () => {
    props.context?.addRateCard?.(props.data);
    setIsClicked(true);
    setTimeout(() => setIsClicked(false), 1000);
  };

  return (
    <div className="flex items-center justify-center h-full">
      <button
        onClick={addRateCard}
        className={`${
          isClicked 
            ? 'bg-orange-500 hover:bg-orange-600' 
            : 'bg-green-500 hover:bg-green-600'
        } text-white border-none rounded-md cursor-pointer px-4 py-0.25 text-xs flex items-center gap-1 transition-all duration-200 ease-in-out shadow-sm hover:shadow-md font-medium`}
        title="Add rate card"
      >
        <ArrowLeft className="h-3 w-3" />
        Add
      </button>
    </div>
  );
};

interface RateCardImportMeta {
  fileName: string | null;
  importedAt: string | null;
}

interface RateCardProps {
  rateCards: RateCardType[];
  importMeta?: RateCardImportMeta | null;
  onRateCardsChange: (rateCards: RateCardType[]) => void;
  onRateCardUpdate?: (id: number, data: Partial<RateCardType>) => void;
  onAddRateCard: (rateCard: Partial<RateCardType>) => void;
  onAddRateCardsBulk: (rateCards: Partial<RateCardType>[], fileName?: string) => Promise<{ message: string; count: number }>;
  onDeleteRateCard: (id: number) => void;
  onDeleteAllRateCards: () => void;
  onAddResourceList?: (resource: any) => void; // Add this prop for resource list integration
  defaultLocation?: string;
  defaultMargin?: number | null;
  exchangeRate?: number;
  clientCurrency?: string;
}

export function RateCard({
  rateCards,
  importMeta,
  onRateCardsChange,
  onRateCardUpdate,
  onAddRateCard,
  onAddRateCardsBulk,
  onDeleteRateCard,
  onDeleteAllRateCards,
  onAddResourceList,
  defaultLocation,
  defaultMargin,
  exchangeRate,
  clientCurrency,
}: RateCardProps) {
  // State for external filters
  const [namingInPMFilter, setNamingInPMFilter] = useState<string>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  
  // State for arrays created from Excel import
  const [namingInPMArray, setNamingInPMArray] = useState<string[]>([]);
  const [disciplineArray, setDisciplineArray] = useState<string[]>([]);
  
  // State for regional tab selection
  const [activeRegionTab, setActiveRegionTab] = useState<string>(
    defaultLocation ?? APP_DEFAULTS.defaultLocation
  );

  const gridRef = useRef<AgGridReact<RateCardType>>(null);

  useEffect(() => {
    if (defaultLocation) {
      setActiveRegionTab(defaultLocation);
    }
  }, [defaultLocation]);
  
  // Update arrays when rateCards change (for existing data)
  React.useEffect(() => {
    if (rateCards.length > 0) {
      const namingInPM = [...new Set(rateCards.map(item => item.namingInPM).filter(value => value && value.trim()))];
      const discipline = [...new Set(rateCards.map(item => item.discipline).filter(value => value && value.trim()))];
      setNamingInPMArray(namingInPM);
      setDisciplineArray(discipline);
    }
  }, [rateCards]);
  
  // Auto-resize columns when regional tab changes
  React.useEffect(() => {
    gridRef.current?.api?.sizeColumnsToFit();
  }, [activeRegionTab]);
  
  // Filtered data based on external filters
  const filteredRateCards = useMemo(() => {
    let filtered = rateCards;
    
    // Apply Naming in PM filter
    if (namingInPMFilter !== 'all') {
      filtered = filtered.filter(rateCard => 
        rateCard.namingInPM?.toLowerCase() === namingInPMFilter.toLowerCase()
      );
    }
    
    // Apply Discipline filter
    if (disciplineFilter !== 'all') {
      filtered = filtered.filter(rateCard => 
        rateCard.discipline?.toLowerCase() === disciplineFilter.toLowerCase()
      );
    }
    
    return filtered;
  }, [rateCards, namingInPMFilter, disciplineFilter]);
  
  const marginPct = defaultMargin ?? APP_DEFAULTS.defaultMargin;
  const fxRate = exchangeRate ?? APP_DEFAULTS.exchangeRate;
  const currencySymbol =
    clientCurrency === 'EUR' ? '€' : clientCurrency === 'GBP' ? '£' : '$';

  // Currency formatter for rate columns
  const currencyFormatter = (params: any) => {
    if (params.value != null) {
      return `$${params.value.toLocaleString()}`;
    }
    return '';
  };

  // Dynamic column definitions based on active regional tab
  const columnDefs: ColDef<RateCardType>[] = useMemo(() => {
    const baseColumns: ColDef<RateCardType>[] = [
      {
        headerName: '',
        field: 'id', // Use existing field to avoid TypeScript error
        sortable: false,
        filter: false,
        resizable: false,
        editable: false,
        width: 80,
        cellRenderer: ActionsCellRenderer,
        pinned: 'left',
        hide: false
      },
      {
        headerName: 'Rate card role',
        field: 'role',
        sortable: true,
        filter: false,
        resizable: true,
        editable: true,
        onCellValueChanged: (params: any) => {
          const updatedRateCards = rateCards.map(rateCard =>
            rateCard.id === params.data.id
              ? { ...rateCard, role: params.newValue }
              : rateCard
          );
          onRateCardsChange(updatedRateCards);
          const updatedRow = updatedRateCards.find(rc => rc.id === params.data.id);
          if (updatedRow?.id != null && onRateCardUpdate) onRateCardUpdate(updatedRow.id, updatedRow);
        }
      },
      {
        headerName: 'Naming in PM',
        field: 'namingInPM',
        sortable: true,
        filter: false, // Disable built-in filter since we're using external filter
        resizable: true,
        editable: true,
        onCellValueChanged: (params: any) => {
          const updatedRateCards = rateCards.map(rateCard =>
            rateCard.id === params.data.id
              ? { ...rateCard, namingInPM: params.newValue }
              : rateCard
          );
          onRateCardsChange(updatedRateCards);
          const updatedRow = updatedRateCards.find(rc => rc.id === params.data.id);
          if (updatedRow?.id != null && onRateCardUpdate) onRateCardUpdate(updatedRow.id, updatedRow);
        }
      },
      {
        headerName: 'Discipline',
        field: 'discipline',
        sortable: true,
        filter: false, // Disable built-in filter since we're using external filter
        resizable: true,
        editable: true,
        onCellValueChanged: (params: any) => {
          const updatedRateCards = rateCards.map(rateCard =>
            rateCard.id === params.data.id
              ? { ...rateCard, discipline: params.newValue }
              : rateCard
          );
          onRateCardsChange(updatedRateCards);
          const updatedRow = updatedRateCards.find(rc => rc.id === params.data.id);
          if (updatedRow?.id != null && onRateCardUpdate) onRateCardUpdate(updatedRow.id, updatedRow);
        }
      },
      {
        headerName: 'Description',
        field: 'description',
        sortable: true,
        filter: false,
        resizable: true,
        flex: 1,
        editable: true,
        onCellValueChanged: (params: any) => {
          const updatedRateCards = rateCards.map(rateCard =>
            rateCard.id === params.data.id
              ? { ...rateCard, description: params.newValue }
              : rateCard
          );
          onRateCardsChange(updatedRateCards);
          const updatedRow = updatedRateCards.find(rc => rc.id === params.data.id);
          if (updatedRow?.id != null && onRateCardUpdate) onRateCardUpdate(updatedRow.id, updatedRow);
        }
      }
    ];

    // Regional rate columns with dynamic visibility based on active tab
    const regionalColumns: ColDef<RateCardType>[] = REGION_FIELDS.map(({ slug, field, columnLabel }) => ({
      headerName: columnLabel,
      field,
      sortable: true,
      filter: false,
      resizable: true,
      width: widthForHeader(columnLabel),
      minWidth: widthForHeader(columnLabel),
      suppressSizeToFit: true,
      valueFormatter: currencyFormatter,
      type: 'numericColumn',
      editable: true,
      hide: activeRegionTab !== slug,
      onCellValueChanged: (params: any) => {
        const updatedRateCards = rateCards.map(rateCard =>
          rateCard.id === params.data.id
            ? { ...rateCard, [field]: parseFloat(params.newValue) || 0 }
            : rateCard
        );
        onRateCardsChange(updatedRateCards);
        const updatedRow = updatedRateCards.find(rc => rc.id === params.data.id);
        if (updatedRow?.id != null && onRateCardUpdate) onRateCardUpdate(updatedRow.id, updatedRow);
      }
    }));

    const priceColumn: ColDef<RateCardType> = {
      headerName: 'Price',
      colId: 'price',
      sortable: true,
      filter: false,
      resizable: true,
      width: widthForHeader('Price'),
      minWidth: widthForHeader('Price'),
      suppressSizeToFit: true,
      editable: false,
      type: 'numericColumn',
      valueGetter: (params) => {
        const region = REGION_FIELDS.find((r) => r.slug === activeRegionTab) ?? REGION_FIELDS[0];
        const intRate = Number(params.data?.[region.field]) || 0;
        return clientHourlyRate(intRate, marginPct / 100, fxRate);
      },
      valueFormatter: (params) => {
        if (params.value != null) {
          return `${currencySymbol}${Math.round(params.value)}`;
        }
        return '';
      },
    };

    return [...baseColumns, ...regionalColumns, priceColumn];
  }, [rateCards, onRateCardsChange, onRateCardUpdate, activeRegionTab, marginPct, fxRate, currencySymbol]);

  const handleImportRateCard = async () => {
    try {
      // The bulk import atomically replaces the rate card on the server, so we
      // do NOT pre-clear here (avoids wiping the table if the dialog is cancelled).
      // Create a file input element
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.xlsx,.xls';
      fileInput.style.display = 'none';
      
      fileInput.onchange = async (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        
        if (!file) return;
        
        try {
          const workbook = new ExcelJS.Workbook();
          const arrayBuffer = await file.arrayBuffer();
          await workbook.xlsx.load(arrayBuffer);
          
          // Get the "RMNG RATES" sheet
          const worksheet = workbook.getWorksheet('RMNG RATES');
          if (!worksheet) {
            alert('Sheet "RMNG RATES" not found in the Excel file');
            return;
          }
          
          const importedData: Partial<RateCardType>[] = [];
          
          // Start from row 2 (assuming row 1 is headers)
          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber <= 2) return; // Skip header row
            
            const rowData: Partial<RateCardType> = {
              role: row.getCell('A').value?.toString() || '',
              namingInPM: row.getCell('B').value?.toString() || '',
              discipline: row.getCell('C').value?.toString() || '',
              description: row.getCell('D').value?.toString() || '',
              ukraine: parseFloat(row.getCell('E').value?.toString() || '0'),
              easternEurope: parseFloat(row.getCell('F').value?.toString() || '0'),
              asiaGE: parseFloat(row.getCell('G').value?.toString() || '0'),
              asiaARMKZ: parseFloat(row.getCell('H').value?.toString() || '0'),
              latam: parseFloat(row.getCell('I').value?.toString() || '0'),
              mexico: parseFloat(row.getCell('J').value?.toString() || '0'),
              india: parseFloat(row.getCell('K').value?.toString() || '0'),
              newYork: parseFloat(row.getCell('L').value?.toString() || '0'),
              london: parseFloat(row.getCell('M').value?.toString() || '0')
            };
            
            // Only add rows that have at least a role name
            if (rowData.role?.trim()) {
              importedData.push(rowData);
            }
          });
          
          if (importedData.length > 0) {
            console.log('Imported data:', importedData);
            
            // Create arrays with unique values from the imported data
            const naming_in_pm = [...new Set(importedData.map(item => item.namingInPM).filter((value): value is string => !!value && value.trim() !== ''))];
            const discipline = [...new Set(importedData.map(item => item.discipline).filter((value): value is string => !!value && value.trim() !== ''))];
            
            // Update state arrays
            setNamingInPMArray(naming_in_pm);
            setDisciplineArray(discipline);
            
            // Add all imported rate cards to the database at once
            try {
              const result = await onAddRateCardsBulk(importedData, file.name);
              alert(`Successfully imported ${result.count} rate card entries`);
            } catch (error) {
              console.error('Error adding bulk rate cards:', error);
              alert(`Error importing rate cards: ${error instanceof Error ? error.message : 'Unknown error'}`);
              return;
            }
          } else {
            alert('No valid data found in the Excel file');
          }
          
        } catch (error) {
          console.error('Error importing Excel file:', error);
          alert('Error importing Excel file. Please check the file format and try again.');
        }
      };
      
      // Trigger file selection
      document.body.appendChild(fileInput);
      fileInput.click();
      document.body.removeChild(fileInput);
      
    } catch (error) {
      console.error('Error setting up file import:', error);
      alert('Error setting up file import');
    }
  };

  const handleClearAllRateCards = () => {
    if (rateCards.length === 0) {
      alert('The table is already empty.');
      return;
    }
    
    const confirmed = window.confirm(`Are you sure you want to delete all ${rateCards.length} rate card entries? This action cannot be undone.`);
    
    if (confirmed) {
      // Use the new bulk delete function
      onDeleteAllRateCards();
    }
  };

  // Enhanced Add button handler that adds to resource list
  const handleAddRateCard = (rateCardData: RateCardType) => {
    if (!onAddResourceList) {
      console.warn('onAddResourceList prop not provided - cannot add to resource list');
      return;
    }

    // Get the daily rate based on active regional tab (default to Ukraine, same as the old switch's default case)
    const regionField = REGION_FIELDS.find((r) => r.slug === activeRegionTab) ?? REGION_FIELDS[0];
    const dailyRate = rateCardData[regionField.field] * 8; // Convert hourly to daily (8 hours)
    const location = regionField.locationLabel;

    // Get the client role from the role mapping
    const clientRole = getClientRoleFromRole(rateCardData.role);

    // Create new resource list entry with copied data (do not include projectId - it is sent via API URL)
    const newResource: any = {
      role: rateCardData.role,
      clientRole: clientRole, // Automatically populate client role
      description: rateCardData.description ?? undefined,
      intRate: dailyRate / 8, // Convert daily rate back to hourly for internal rate
      location: location || undefined,
    };

    // Add to resource list
    onAddResourceList(newResource);
    
    console.log('Added rate card to resource list:', {
      original: rateCardData,
      newResource,
      activeTab: activeRegionTab,
      dailyRate,
      location,
      clientRole
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button onClick={handleImportRateCard} title="Import rate card">
          <Plus className="h-4 w-4 mr-1"/>
          Import rate card
        </Button>
        <Button
          onClick={handleClearAllRateCards}
          variant="destructive"
          title="Clear all rate cards"
          disabled={rateCards.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-1"/>
          Clear All
        </Button>
        {importMeta?.fileName && (
          <div className="ml-2 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
            <span className="flex items-center gap-1.5" title="Imported file">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span className="font-medium text-foreground">{importMeta.fileName}</span>
            </span>
            {importMeta.importedAt && (
              <>
                <span className="h-4 w-px bg-border" />
                <span className="flex items-center gap-1.5 text-muted-foreground" title="Last imported">
                  <CalendarClock className="h-4 w-4" />
                  {new Date(importMeta.importedAt).toLocaleString()}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* External Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Naming in PM:</span>
          <Select value={namingInPMFilter} onValueChange={setNamingInPMFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {namingInPMArray.map((value) => (
                <SelectItem key={value} value={value.toLowerCase()}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Discipline:</span>
          <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select discipline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {disciplineArray.map((value) => (
                <SelectItem key={value} value={value.toLowerCase()}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Default Margin:</span>
          <span className="text-sm">{marginPct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Regional Tab Switcher */}
      <div className="space-y-3">
     
        <Tabs value={activeRegionTab} onValueChange={setActiveRegionTab}>
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="ukraine">Ukraine</TabsTrigger>
            <TabsTrigger value="eastern-europe">Eastern Europe</TabsTrigger>
            <TabsTrigger value="asia-ge">Asia (GE)</TabsTrigger>
            <TabsTrigger value="asia-arm-kz">Asia (ARM,KZ)</TabsTrigger>
            <TabsTrigger value="latam">LATAM</TabsTrigger>
            <TabsTrigger value="mexico">Mexico</TabsTrigger>
            <TabsTrigger value="india">India</TabsTrigger>
            <TabsTrigger value="new-york">New York</TabsTrigger>
            <TabsTrigger value="london">London</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="ag-theme-alpine" style={{ height: 600, width: '100%' }}>
        <AgGridReact
          ref={gridRef}
          theme="legacy"
          context={{ addRateCard: handleAddRateCard }}
          rowData={filteredRateCards}
          columnDefs={columnDefs}
          pagination={true}
          paginationPageSize={20}
          domLayout="autoHeight"
          suppressRowClickSelection={true}
          rowSelection="multiple"
          animateRows={true}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
            minWidth: 100
          }}
        />
      </div>
    </div>
  );
}
