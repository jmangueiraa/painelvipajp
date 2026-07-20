
CREATE TABLE IF NOT EXISTS public.push_notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL,
  url TEXT,
  target_client_ids UUID[],
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_notifications_log TO authenticated;
GRANT ALL ON public.push_notifications_log TO service_role;
ALTER TABLE public.push_notifications_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs" ON public.push_notifications_log FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS push_log_user_created_idx ON public.push_notifications_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS push_log_scheduled_idx ON public.push_notifications_log (status, scheduled_at) WHERE status = 'scheduled';
