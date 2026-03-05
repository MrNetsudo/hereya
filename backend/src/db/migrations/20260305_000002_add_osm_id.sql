-- Migration: add osm_id to venues table for OpenStreetMap data
-- Run in Supabase SQL Editor

ALTER TABLE venues ADD COLUMN IF NOT EXISTS osm_id TEXT UNIQUE;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS osm_synced_at TIMESTAMPTZ;

-- Allow null foursquare_id so OSM-only venues can coexist
ALTER TABLE venues ALTER COLUMN foursquare_id DROP NOT NULL;

-- Index for osm_id lookups
CREATE INDEX IF NOT EXISTS idx_venues_osm_id ON venues (osm_id);
