-- Run in Supabase SQL Editor (existing beats table).
-- Converts status TEXT → enum so Table Editor shows a dropdown.
-- Policies must be dropped first — they reference the status column.

DROP POLICY IF EXISTS "Approved beats are public" ON public.beats;
DROP POLICY IF EXISTS "Producers can submit beats" ON public.beats;
DROP POLICY IF EXISTS "Producers can update own beats" ON public.beats;

DO $$ BEGIN
  CREATE TYPE public.beat_status AS ENUM ('pending', 'approved', 'removed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.beats DROP CONSTRAINT IF EXISTS beats_status_check;

ALTER TABLE public.beats
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.beats
  ALTER COLUMN status TYPE public.beat_status
  USING status::text::public.beat_status;

ALTER TABLE public.beats
  ALTER COLUMN status SET DEFAULT 'pending';

CREATE POLICY "Approved beats are public"
  ON public.beats FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Producers can submit beats"
  ON public.beats FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND producer = (SELECT producer_name FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Producers can update own beats"
  ON public.beats FOR UPDATE
  TO authenticated
  USING (producer = (SELECT producer_name FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (producer = (SELECT producer_name FROM public.profiles WHERE id = auth.uid()));
