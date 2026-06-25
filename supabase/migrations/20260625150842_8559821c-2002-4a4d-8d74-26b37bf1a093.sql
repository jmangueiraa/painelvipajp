
CREATE TABLE public.content_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('movie','series')),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX content_updates_user_kind_idx ON public.content_updates(user_id, kind, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_updates TO authenticated;
GRANT ALL ON public.content_updates TO service_role;

ALTER TABLE public.content_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their content updates"
ON public.content_updates FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
