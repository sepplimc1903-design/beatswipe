-- Optional cover image on each beat (shown in the card cover box).
-- Run once in Supabase SQL Editor.

ALTER TABLE public.beats
  ADD COLUMN IF NOT EXISTS cover_url text;
