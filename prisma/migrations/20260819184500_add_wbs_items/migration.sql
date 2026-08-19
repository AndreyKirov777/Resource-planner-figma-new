-- CreateTable
CREATE TABLE "WbsItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "phaseName" TEXT,
    "projectId" INTEGER NOT NULL,
    CONSTRAINT "WbsItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WbsItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WbsItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WbsEstimate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discipline" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "hours" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "wbsItemId" INTEGER NOT NULL,
    CONSTRAINT "WbsEstimate_wbsItemId_fkey" FOREIGN KEY ("wbsItemId") REFERENCES "WbsItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WbsEstimate_wbsItemId_discipline_role_key" ON "WbsEstimate"("wbsItemId", "discipline", "role");
