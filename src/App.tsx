import React, { useState, useEffect } from 'react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ResourcePlan } from './components/ResourcePlan';
import { ResourceList } from './components/ResourceList';
import { RateCard } from './components/RateCard';
import { api, Project, ResourceList as ResourceListType, RateCard as RateCardType, ResourcePlan as ResourcePlanType } from './services/api';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Button } from './components/ui/button';
import * as ExcelJS from 'exceljs';
import { marginPct, estimatedEffortHours, totalInternalCost, totalClientCost } from './utils/calculations';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

export default function App() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [editableProjectName, setEditableProjectName] = useState<string>('');
  const [editableProjectDescription, setEditableProjectDescription] = useState<string>('');
  const [resourceLists, setResourceLists] = useState<ResourceListType[]>([]);
  const [rateCards, setRateCards] = useState<RateCardType[]>([]);
  const [resourcePlans, setResourcePlans] = useState<ResourcePlanType[]>([]);
  const [activeTab, setActiveTab] = useState('resource-plan');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadProjectData();
  }, []);

  const loadProjectData = async (preferredProjectId?: number) => {
    try {
      setLoading(true);
      setError(null);
      
      // Get all projects (or create default)
      const projects = await api.getProjects();
      let project: Project;
      
      if (projects.length === 0) {
        // Create default project if none exists
        project = await api.createProject({
          name: 'Default Project',
          description: 'Default project for resource planning',
          daysInFTE: 20,
          clientCurrency: 'EUR',
          exchangeRate: 0.89
        });
      } else if (preferredProjectId) {
        // Load the preferred project if specified
        const found = projects.find(p => p.id === preferredProjectId);
        project = found ? found : projects[0];
      } else {
        project = projects[0];
      }
      
      setCurrentProject(project);
      setEditableProjectName(project.name || '');
      setEditableProjectDescription(project.description || '');
      
      // Load all related data
      const [resourceListsData, rateCardsData, resourcePlansData] = await Promise.all([
        api.getResourceLists(project.id),
        api.getRateCards(project.id),
        api.getResourcePlans(project.id)
      ]);
      
      setResourceLists(resourceListsData);
      setRateCards(rateCardsData);
      setResourcePlans(resourcePlansData);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project data');
      console.error('Error loading project data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResourceListsChange = (updatedResourceLists: ResourceListType[]) => {
    setResourceLists(updatedResourceLists);
  };

  const handleResourceListUpdate = async (id: number, data: Partial<ResourceListType>) => {
    try {
      await api.updateResourceList(id, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update resource list');
      console.error('Error updating resource list:', err);
    }
  };

  const handleAddResourceList = async (newResource: Partial<ResourceListType>) => {
    if (!currentProject) return;
    
    try {
      const createdResource = await api.createResourceList(currentProject.id, newResource);
      setResourceLists(prev => [...prev, createdResource]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add resource');
      console.error('Error adding resource:', err);
    }
  };

  const handleDeleteResourceList = async (id: number) => {
    try {
      await api.deleteResourceList(id);
      setResourceLists(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete resource');
      console.error('Error deleting resource:', err);
    }
  };

  const handleRateCardsChange = (updatedRateCards: RateCardType[]) => {
    setRateCards(updatedRateCards);
  };

  const handleRateCardUpdate = async (id: number, data: Partial<RateCardType>) => {
    try {
      await api.updateRateCard(id, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rate card');
      console.error('Error updating rate card:', err);
    }
  };

  const handleAddRateCard = async (newRateCard: Partial<RateCardType>) => {
    if (!currentProject) return;
    
    try {
      console.log('Adding rate card:', newRateCard);
      const createdRateCard = await api.createRateCard(currentProject.id, newRateCard);
      setRateCards(prev => [...prev, createdRateCard]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add rate card';
      setError(errorMessage);
      console.error('Error adding rate card:', err);
      throw err; // Re-throw to be caught by the calling function
    }
  };

  const handleAddRateCardsBulk = async (newRateCards: Partial<RateCardType>[]) => {
    if (!currentProject) {
      throw new Error('No current project available');
    }
    
    try {
      console.log('Adding bulk rate cards:', newRateCards);
      const result = await api.createRateCardsBulk(currentProject.id, newRateCards);
      
      // Reload all rate cards to get the updated list with IDs
      const updatedRateCards = await api.getRateCards(currentProject.id);
      setRateCards(updatedRateCards);
      
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add bulk rate cards';
      setError(errorMessage);
      console.error('Error adding bulk rate cards:', err);
      throw err; // Re-throw to be caught by the calling function
    }
  };

  const handleDeleteRateCard = async (id: number) => {
    try {
      await api.deleteRateCard(id);
      setRateCards(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rate card');
      console.error('Error deleting rate card:', err);
    }
  };

  const handleDeleteAllRateCards = async () => {
    if (!currentProject) return;
    try {
      const result = await api.deleteAllRateCards(currentProject.id);
      setRateCards([]);
      console.log(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rate cards');
      console.error('Error deleting rate cards:', err);
    }
  };

  const handleResourcePlansChange = async (updatedResourcePlans: ResourcePlanType[]) => {
    try {
      setResourcePlans(updatedResourcePlans);
      
      // Update the database for any changes (send only fields allowed by server resourcePlanUpdateSchema - strict)
      for (const resourcePlan of updatedResourcePlans) {
        if (resourcePlan.id) {
          try {
            const updateData = {
              role: resourcePlan.role,
              clientRole: resourcePlan.clientRole ?? undefined,
              name: resourcePlan.name ?? undefined,
              intHourlyRate: resourcePlan.intHourlyRate,
              clientHourlyRate: resourcePlan.clientHourlyRate,
              weeklyAllocations: resourcePlan.weeklyAllocations?.map(wa => ({
                weekNumber: wa.weekNumber,
                allocation: wa.allocation
              }))
            };
            await api.updateResourcePlan(resourcePlan.id, updateData);
          } catch (updateErr) {
            console.error(`Failed to update resource plan ${resourcePlan.id}:`, updateErr);
            // Continue with other updates even if one fails
          }
        }
      }
      
      // Refresh the resource plans data to get updated IDs and ensure consistency
      if (currentProject) {
        try {
          const refreshedResourcePlans = await api.getResourcePlans(currentProject.id);
          setResourcePlans(refreshedResourcePlans);
        } catch (refreshErr) {
          console.error('Failed to refresh resource plans:', refreshErr);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update resource plans';
      setError(errorMessage);
      console.error('Error updating resource plans:', err);
    }
  };

  const handleAddResourcePlan = async (newResourcePlan: Partial<ResourcePlanType>) => {
    if (!currentProject) return;
    
    try {
      const createdResourcePlan = await api.createResourcePlan(currentProject.id, newResourcePlan);
      setResourcePlans(prev => [...prev, createdResourcePlan]);
      
      // Refresh the resource plans data to ensure consistency
      try {
        const refreshedResourcePlans = await api.getResourcePlans(currentProject.id);
        setResourcePlans(refreshedResourcePlans);
      } catch (refreshErr) {
        console.error('Failed to refresh resource plans after creation:', refreshErr);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add resource plan');
      console.error('Error adding resource plan:', err);
    }
  };

  const handleDeleteResourcePlan = async (id: number) => {
    try {
      await api.deleteResourcePlan(id);
      setResourcePlans(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete resource plan');
      console.error('Error deleting resource plan:', err);
    }
  };

  const handleProjectSettingsChange = async (settings: Partial<Project>) => {
    if (!currentProject) return;
    
    try {
      const updatedProject = await api.updateProject(currentProject.id, settings);
      setCurrentProject(updatedProject);
      if (typeof settings.name !== 'undefined') {
        setEditableProjectName(updatedProject.name || '');
      }
      if (typeof settings.description !== 'undefined') {
        setEditableProjectDescription(updatedProject.description || '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project settings');
      console.error('Error updating project settings:', err);
    }
  };

  const handleExportProject = async () => {
    if (!currentProject) return;
    try {
      const payload = await api.exportProject(currentProject.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${currentProject.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export project');
    }
  };

  const handleImportProject = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const json = JSON.parse(text);
        const result = await api.importProject(json);
        alert(`Import completed. New project ID: ${result.projectId}`);
        await loadProjectData(result.projectId);
        
        // Force recalculation of all calculated values by triggering a re-render
        // This ensures that all calculated fields are updated after import
        setTimeout(() => {
          // Force a state update to trigger recalculation
          setResourcePlans(prev => [...prev]);
        }, 100);
      };
      input.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import project');
    }
  };

  const handleExportToExcel = async () => {
    if (!currentProject || resourcePlans.length === 0) {
      alert('No planning data to export');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Resource Planning');

      // Get all week numbers from resource plans
      const allWeekNumbers = new Set<number>();
      resourcePlans.forEach(plan => {
        plan.weeklyAllocations.forEach(allocation => {
          allWeekNumbers.add(allocation.weekNumber);
        });
      });
      const weekNumbers = Array.from(allWeekNumbers).sort((a, b) => a - b);

      // Get currency symbol based on client currency
      const currencySymbol = currentProject.clientCurrency === 'EUR' ? '€' : 
                            currentProject.clientCurrency === 'GBP' ? '£' : '$';

      // Define headers
      const headers = [
        'Rate Card Role',
        'Client Role',
        'Name',
        'Internal Hourly Cost ($)',
        'Internal Daily Cost ($)',
        `Client Hourly Rate (${currencySymbol})`,
        `Client Daily Rate (${currencySymbol})`,
        'Margin (%)',
        ...weekNumbers.map(week => `Week ${week} (%)`),
        'Total Internal Cost ($)',
        `Total Price (${currencySymbol})`,
        'Estimated Efforts (h)'
      ];

      // Add headers to worksheet
      worksheet.addRow(headers);

      // Style the header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Add data rows
      resourcePlans.forEach(plan => {
        const intDailyRate = plan.intHourlyRate * 8;
        const clientDailyRate = plan.clientHourlyRate * 8;
        const margin = marginPct(plan.clientHourlyRate, plan.intHourlyRate, currentProject.exchangeRate) ?? 0;

        let totalWeeksEquivalent = 0;
        weekNumbers.forEach(weekNum => {
          const allocation = plan.weeklyAllocations.find(wa => wa.weekNumber === weekNum);
          totalWeeksEquivalent += (allocation?.allocation || 0) / 100;
        });
        const totalEfforts = estimatedEffortHours(totalWeeksEquivalent, 40);
        const totalIntCost = totalInternalCost(totalEfforts, plan.intHourlyRate);
        const totalPrice = totalClientCost(totalEfforts, plan.clientHourlyRate);

        // Prepare row data
        const rowData = [
          plan.role || '',
          plan.clientRole || '',
          plan.name || '',
          plan.intHourlyRate,
          intDailyRate,
          plan.clientHourlyRate,
          clientDailyRate,
          margin,
          ...weekNumbers.map(weekNum => {
            const allocation = plan.weeklyAllocations.find(wa => wa.weekNumber === weekNum);
            return allocation?.allocation || 0;
          }),
          totalIntCost,
          totalPrice,
          totalEfforts
        ];

        worksheet.addRow(rowData);
      });

      // Add totals row
      const totalsRow = [
        'TOTALS',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ...weekNumbers.map(() => ''),
        resourcePlans.reduce((sum, plan) => {
          let totalWeeksEquivalent = 0;
          weekNumbers.forEach(weekNum => {
            const allocation = plan.weeklyAllocations.find(wa => wa.weekNumber === weekNum);
            totalWeeksEquivalent += (allocation?.allocation || 0) / 100;
          });
          const hours = estimatedEffortHours(totalWeeksEquivalent, 40);
          return sum + totalInternalCost(hours, plan.intHourlyRate);
        }, 0),
        resourcePlans.reduce((sum, plan) => {
          let totalWeeksEquivalent = 0;
          weekNumbers.forEach(weekNum => {
            const allocation = plan.weeklyAllocations.find(wa => wa.weekNumber === weekNum);
            totalWeeksEquivalent += (allocation?.allocation || 0) / 100;
          });
          const hours = estimatedEffortHours(totalWeeksEquivalent, 40);
          return sum + totalClientCost(hours, plan.clientHourlyRate);
        }, 0),
        resourcePlans.reduce((sum, plan) => {
          let totalWeeksEquivalent = 0;
          weekNumbers.forEach(weekNum => {
            const allocation = plan.weeklyAllocations.find(wa => wa.weekNumber === weekNum);
            totalWeeksEquivalent += (allocation?.allocation || 0) / 100;
          });
          return sum + estimatedEffortHours(totalWeeksEquivalent, 40);
        }, 0)
      ];

      const totalsRowIndex = worksheet.addRow(totalsRow);
      const totalsRowObj = worksheet.getRow(totalsRowIndex.number);
      totalsRowObj.font = { bold: true };
      totalsRowObj.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' }
      };

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        if (column.eachCell) {
          let maxLength = 0;
          column.eachCell({ includeEmpty: true }, (cell) => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
              maxLength = columnLength;
            }
          });
          column.width = Math.min(maxLength + 2, 20);
        }
      });

      // Format currency columns with appropriate currency symbols
      const internalCostColumns = [4, 5, 9 + weekNumbers.length]; // Internal Hourly Cost, Internal Daily Cost, Total Internal Cost (always USD)
      internalCostColumns.forEach(colIndex => {
        worksheet.getColumn(colIndex).numFmt = '$#,##0';
      });

      // Format client currency columns (Client Hourly Rate, Client Daily Rate, Total Price)
      const clientCurrencyColumns = [6, 7, 10 + weekNumbers.length]; // Client Hourly Rate, Client Daily Rate, Total Price
      const clientCurrencyFormat = currentProject.clientCurrency === 'EUR' ? '€#,##0' :
                                  currentProject.clientCurrency === 'GBP' ? '£#,##0' : '$#,##0';
      clientCurrencyColumns.forEach(colIndex => {
        worksheet.getColumn(colIndex).numFmt = clientCurrencyFormat;
      });

      // Format percentage columns - Margin and all week columns
      const marginColumn = 8;
      const weekColumns = weekNumbers.map((_, index) => 9 + index);
      const percentageColumns = [marginColumn, ...weekColumns];
      
      percentageColumns.forEach(colIndex => {
        worksheet.getColumn(colIndex).numFmt = '0"%"';
      });
      
      // Format efforts column
      worksheet.getColumn(9 + weekNumbers.length + 2).numFmt = '0';

      // Generate Excel file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resource-planning-${currentProject.name || 'project'}-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export to Excel');
      console.error('Error exporting to Excel:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading project data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 font-medium">Error: {error}</div>
          <button 
            onClick={loadProjectData}
            className="mt-2 text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="p-6">
        <div className="text-center">
          <div className="text-lg">No project found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="resource-plan">Resource Plan</TabsTrigger>
          <TabsTrigger value="resource-list">Resource List</TabsTrigger>
          <TabsTrigger value="rate-card">Rate Card</TabsTrigger>
        </TabsList>
        
        <TabsContent value="resource-plan" className="mt-6">
          <ResourcePlan 
            key={currentProject?.id || 'default'}
            project={currentProject}
            resourceLists={resourceLists}
            resourcePlans={resourcePlans}
            onResourcePlansChange={handleResourcePlansChange}
            onAddResourcePlan={handleAddResourcePlan}
            onDeleteResourcePlan={handleDeleteResourcePlan}
            onProjectSettingsChange={handleProjectSettingsChange}
            onExportProject={handleExportProject}
            onImportProject={handleImportProject}
            onExportToExcel={handleExportToExcel}
            projectName={editableProjectName}
            projectDescription={editableProjectDescription}
            onProjectNameChange={(name) => {
              setEditableProjectName(name);
              handleProjectSettingsChange({ name });
            }}
            onProjectDescriptionChange={(description) => {
              setEditableProjectDescription(description);
              handleProjectSettingsChange({ description });
            }}
          />
        </TabsContent>
        
        <TabsContent value="resource-list" className="mt-6">
<ResourceList
            resourceLists={resourceLists}
            onResourceListsChange={handleResourceListsChange}
            onResourceListUpdate={handleResourceListUpdate}
            onAddResourceList={handleAddResourceList}
            onDeleteResourceList={handleDeleteResourceList}
          />
        </TabsContent>

        <TabsContent value="rate-card" className="mt-6">
          <RateCard
            projectId={currentProject.id}
            rateCards={rateCards}
            onRateCardsChange={handleRateCardsChange}
            onRateCardUpdate={handleRateCardUpdate}
            onAddRateCard={handleAddRateCard}
            onAddRateCardsBulk={handleAddRateCardsBulk}
            onDeleteRateCard={handleDeleteRateCard}
            onDeleteAllRateCards={handleDeleteAllRateCards}
            onAddResourceList={handleAddResourceList}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}