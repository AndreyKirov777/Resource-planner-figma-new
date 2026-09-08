-- Per-item roadmap bar colours: planner-picked fill on RoadmapItem.
-- Default matches the historic accent `#8f4f8f` so existing rows look unchanged.
ALTER TABLE "RoadmapItem" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#8f4f8f';
