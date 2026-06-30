-- Migrate from per-project RateCard to a single global rate card shared by all projects.

-- CreateTable
CREATE TABLE "GlobalRateCard" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "role" TEXT NOT NULL,
    "namingInPM" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "description" TEXT,
    "ukraine" REAL NOT NULL,
    "easternEurope" REAL NOT NULL,
    "asiaGE" REAL NOT NULL,
    "asiaARMKZ" REAL NOT NULL,
    "latam" REAL NOT NULL,
    "mexico" REAL NOT NULL,
    "india" REAL NOT NULL,
    "newYork" REAL NOT NULL,
    "london" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RateCardImportMeta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "fileName" TEXT,
    "importedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- Copy one project's rate card into the global table (deduplicated).
INSERT INTO "GlobalRateCard" (
    "role", "namingInPM", "discipline", "description",
    "ukraine", "easternEurope", "asiaGE", "asiaARMKZ",
    "latam", "mexico", "india", "newYork", "london",
    "createdAt", "updatedAt"
)
SELECT
    "role", "namingInPM", "discipline", "description",
    "ukraine", "easternEurope", "asiaGE", "asiaARMKZ",
    "latam", "mexico", "india", "newYork", "london",
    "createdAt", "updatedAt"
FROM "RateCard"
WHERE "projectId" = (SELECT MIN("projectId") FROM "RateCard")
  AND EXISTS (SELECT 1 FROM "RateCard" LIMIT 1);

-- Drop the old per-project table.
DROP TABLE "RateCard";
