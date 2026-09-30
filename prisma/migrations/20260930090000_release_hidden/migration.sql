-- Additive only: a nullable column. Existing rows stay visible (NULL = not hidden).
ALTER TABLE "releases" ADD COLUMN "hiddenAt" TIMESTAMPTZ(3);
