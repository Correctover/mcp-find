-- Migration: Add canonical_slug for stable server URLs
-- This column is set once on INSERT and never overwritten on subsequent syncs,
-- so a server's public URL (/servers/<canonical_slug>) never changes even if
-- the upstream registry renames the server.
--
-- Deploy order:
--   1. Apply this migration (adds the column + backfill).
--   2. Deploy the app code (uses canonical_slug ?? slug defensively — safe either way).
-- The code can be deployed BEFORE this migration runs without any breakage.

ALTER TABLE servers ADD COLUMN IF NOT EXISTS canonical_slug TEXT;

-- Backfill: seed canonical_slug from the current slug for all existing rows.
-- New inserts after this migration will set canonical_slug at write time.
UPDATE servers SET canonical_slug = slug WHERE canonical_slug IS NULL;

-- RPC called by registry-sync after each upsert batch to backfill canonical_slug
-- for newly-inserted rows (which have slug but null canonical_slug).
-- Existing rows with a canonical_slug are never touched — immutability guaranteed.
CREATE OR REPLACE FUNCTION backfill_canonical_slug()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE servers SET canonical_slug = slug WHERE canonical_slug IS NULL;
$$;
