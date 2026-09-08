-- Default bar colour is dusty slate `#5D6E85`.
-- Rows still on the historic accent `#8f4f8f` (never picked) pick up the new default.
UPDATE "RoadmapItem" SET "color" = '#5D6E85' WHERE lower("color") IN ('#8f4f8f', '#5d748e');
