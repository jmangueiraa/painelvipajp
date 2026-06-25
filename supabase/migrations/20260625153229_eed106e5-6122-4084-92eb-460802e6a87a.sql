ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS updates_movies_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updates_series_updated_at timestamptz;