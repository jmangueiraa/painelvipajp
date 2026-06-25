ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS updates_movies_text TEXT,
  ADD COLUMN IF NOT EXISTS updates_series_text TEXT;