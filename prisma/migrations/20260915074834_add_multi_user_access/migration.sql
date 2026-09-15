/*
  Warnings:

  - You are about to drop the column `isExternal` on the `ResourcePlan` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entraObjectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    CONSTRAINT "ShareLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "daysInFTE" INTEGER NOT NULL DEFAULT 21,
    "clientCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "exchangeRate" REAL NOT NULL DEFAULT 0.89,
    "defaultMargin" REAL DEFAULT 45.0,
    "investment" REAL NOT NULL DEFAULT 0,
    "planningMode" TEXT NOT NULL DEFAULT 'weekly',
    "defaultLocation" TEXT DEFAULT 'ukraine',
    "phases" TEXT DEFAULT '[{"name":"Phase 1","periodCount":8,"color":"#E3F2FD"}]',
    "startDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ownerId" INTEGER,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("clientCurrency", "createdAt", "daysInFTE", "defaultLocation", "defaultMargin", "description", "exchangeRate", "id", "investment", "name", "planningMode", "startDate", "status", "updatedAt") SELECT "clientCurrency", "createdAt", "daysInFTE", "defaultLocation", "defaultMargin", "description", "exchangeRate", "id", "investment", "name", "planningMode", "startDate", "status", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE TABLE "new_ResourceList" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "clientRole" TEXT,
    "name" TEXT,
    "intRate" REAL NOT NULL,
    "hourlyRate" REAL NOT NULL DEFAULT 0,
    "location" TEXT,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "ResourceList_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResourceList_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ResourceList" ("clientRole", "createdAt", "description", "hourlyRate", "id", "intRate", "location", "name", "projectId", "role", "updatedAt") SELECT "clientRole", "createdAt", "description", "hourlyRate", "id", "intRate", "location", "name", "projectId", "role", "updatedAt" FROM "ResourceList";
DROP TABLE "ResourceList";
ALTER TABLE "new_ResourceList" RENAME TO "ResourceList";
CREATE TABLE "new_ResourcePlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "clientRole" TEXT,
    "name" TEXT,
    "intHourlyRate" REAL NOT NULL,
    "clientHourlyRate" REAL NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedById" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "ResourcePlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResourcePlan_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ResourcePlan" ("clientHourlyRate", "clientRole", "createdAt", "id", "intHourlyRate", "name", "projectId", "role", "updatedAt") SELECT "clientHourlyRate", "clientRole", "createdAt", "id", "intHourlyRate", "name", "projectId", "role", "updatedAt" FROM "ResourcePlan";
DROP TABLE "ResourcePlan";
ALTER TABLE "new_ResourcePlan" RENAME TO "ResourcePlan";
CREATE TABLE "new_RoadmapItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'bar',
    "startPeriod" INTEGER NOT NULL,
    "periodCount" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#5D6E85',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "laneId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "RoadmapItem_laneId_fkey" FOREIGN KEY ("laneId") REFERENCES "RoadmapLane" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoadmapItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RoadmapItem" ("color", "createdAt", "displayOrder", "id", "kind", "laneId", "name", "periodCount", "projectId", "startPeriod", "updatedAt") SELECT "color", "createdAt", "displayOrder", "id", "kind", "laneId", "name", "periodCount", "projectId", "startPeriod", "updatedAt" FROM "RoadmapItem";
DROP TABLE "RoadmapItem";
ALTER TABLE "new_RoadmapItem" RENAME TO "RoadmapItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_entraObjectId_key" ON "User"("entraObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");
