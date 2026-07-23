
-- PWA install tracking
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS installed_at timestamptz,
  ADD COLUMN IF NOT EXISTS os text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS app_version text;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_device text,
  ADD COLUMN IF NOT EXISTS pwa_installed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.portal_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  ip text,
  os text,
  browser text,
  user_agent text,
  event text NOT NULL DEFAULT 'login',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portal_access_log TO authenticated;
GRANT ALL ON public.portal_access_log TO service_role;

ALTER TABLE public.portal_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads access log"
  ON public.portal_access_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_portal_access_log_client ON public.portal_access_log(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_access_log_user ON public.portal_access_log(user_id, created_at DESC);
