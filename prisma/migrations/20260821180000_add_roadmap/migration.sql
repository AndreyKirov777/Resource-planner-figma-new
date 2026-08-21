-- AlterTable
ALTER TABLE "Project" ADD COLUMN "startDate" DATETIME;

-- CreateTable
CREATE TABLE "RoadmapLane" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "RoadmapLane_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'bar',
    "startPeriod" INTEGER NOT NULL,
    "periodCount" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "laneId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "RoadmapItem_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "RoadmapLane" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoadmapItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoadmapLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wbsItemId" INTEGER NOT NULL,
    "roadmapItemId" INTEGER NOT NULL,
    CONSTRAINT "RoadmapLink_wbsItemId_fkey" FOREIGN KEY ("wbsItemId") REFERENCES "WbsItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoadmapLink_roadmapItemId_fkey" FOREIGN KEY ("roadmapItemId") REFERENCES "RoadmapItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapLink_wbsItemId_key" ON "RoadmapLink"("wbsItemId");
