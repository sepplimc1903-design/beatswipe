-- BeatSwipe: producer portfolio stats (run in Supabase SQL Editor)
-- Tracks page views, saves, and buy clicks on /p/* — service role only.

CREATE TABLE IF NOT EXISTS public.portfolio_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer    TEXT NOT NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN ('view', 'save', 'buy_click')),
  beat_id     TEXT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_events_producer_type_idx
  ON public.portfolio_events (producer, event_type);

CREATE INDEX IF NOT EXISTS portfolio_events_created_at_idx
  ON public.portfolio_events (created_at DESC);

ALTER TABLE public.portfolio_events ENABLE ROW LEVEL SECURITY;
