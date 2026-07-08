-- Add TikTok, Spotify, and Airbit link columns to producer profiles.
-- Run once in Supabase SQL Editor (Table Editor does not add columns automatically).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tiktok text,
  ADD COLUMN IF NOT EXISTS spotify text,
  ADD COLUMN IF NOT EXISTS airbit text;
