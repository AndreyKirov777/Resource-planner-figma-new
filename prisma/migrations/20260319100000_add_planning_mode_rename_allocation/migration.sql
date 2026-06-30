-- Add planningMode column to Project
ALTER TABLE "Project" ADD COLUMN "planningMode" TEXT NOT NULL DEFAULT 'weekly';

-- Rename WeeklyAllocation to Allocation with periodNumber
CREATE TABLE "Allocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "periodNumber" INTEGER NOT NULL,
    "allocation" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resourcePlanId" INTEGER NOT NULL,
    CONSTRAINT "Allocation_resourcePlanId_fkey" FOREIGN KEY ("resourcePlanId") REFERENCES "ResourcePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Copy data from WeeklyAllocation to Allocation
INSERT INTO "Allocation" ("id", "periodNumber", "allocation", "createdAt", "updatedAt", "resourcePlanId")
SELECT "id", "weekNumber", "allocation", "createdAt", "updatedAt", "resourcePlanId"
FROM "WeeklyAllocation";

-- Drop old table
DROP TABLE "WeeklyAllocation";

-- Create unique index
CREATE UNIQUE INDEX "Allocation_resourcePlanId_periodNumber_key" ON "Allocation"("resourcePlanId", "periodNumber");
