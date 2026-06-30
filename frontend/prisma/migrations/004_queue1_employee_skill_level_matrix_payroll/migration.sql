ALTER TABLE "Employee"
ADD COLUMN "skillLevel" TEXT;

UPDATE "Employee"
SET "skillLevel" = CASE
  WHEN "workPercent" = 35 THEN 'level_1'
  WHEN "workPercent" = 30 THEN 'level_2'
  WHEN "workPercent" = 40 THEN 'level_3'
  ELSE NULL
END
WHERE "skillLevel" IS NULL;
