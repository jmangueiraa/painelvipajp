ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS updates_games_text text,
  ADD COLUMN IF NOT EXISTS updates_games_updated_at timestamptz;