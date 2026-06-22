-- BeatSwipe: beats table (run in Supabase SQL Editor)
-- Fresh start — no Airtable migration.
-- Existing table: use beats-status-enum.sql for status dropdown in Table Editor.

DO $$ BEGIN
  CREATE TYPE public.beat_status AS ENUM ('pending', 'approved', 'removed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.beats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer      TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT 'Untitled',
  genre         TEXT DEFAULT 'Other',
  type          TEXT DEFAULT 'Full Beat',
  bpm           NUMERIC,
  key           TEXT DEFAULT 'N/A',
  preview_url   TEXT DEFAULT '',
  preview_type  TEXT,
  buy_link      TEXT DEFAULT '',
  color         TEXT DEFAULT '#BA7517',
  status        public.beat_status NOT NULL DEFAULT 'pending',
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beats_status_idx ON public.beats (status);
CREATE INDEX IF NOT EXISTS beats_producer_status_idx ON public.beats (producer, status);

CREATE OR REPLACE FUNCTION public.beats_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS beats_updated_at ON public.beats;
CREATE TRIGGER beats_updated_at
  BEFORE UPDATE ON public.beats
  FOR EACH ROW EXECUTE FUNCTION public.beats_set_updated_at();

ALTER TABLE public.beats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved beats are public" ON public.beats;
CREATE POLICY "Approved beats are public"
  ON public.beats FOR SELECT
  USING (status = 'approved');

DROP POLICY IF EXISTS "Producers can submit beats" ON public.beats;
CREATE POLICY "Producers can submit beats"
  ON public.beats FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND producer = (SELECT producer_name FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Producers can update own beats" ON public.beats;
CREATE POLICY "Producers can update own beats"
  ON public.beats FOR UPDATE
  TO authenticated
  USING (producer = (SELECT producer_name FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (producer = (SELECT producer_name FROM public.profiles WHERE id = auth.uid()));
