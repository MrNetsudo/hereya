-- Migration: add unique constraints needed for upsert operations
-- Run in Supabase SQL Editor

-- user_presence: one active row per user per venue
ALTER TABLE user_presence
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ DEFAULT NOW();

-- Drop if exists first to avoid errors on re-run
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_presence_user_venue'
  ) THEN
    ALTER TABLE user_presence
      ADD CONSTRAINT uq_user_presence_user_venue UNIQUE (user_id, venue_id);
  END IF;
END $$;

-- room_members: one membership row per user per room
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_room_members_room_user'
  ) THEN
    ALTER TABLE room_members
      ADD CONSTRAINT uq_room_members_room_user UNIQUE (room_id, user_id);
  END IF;
END $$;
