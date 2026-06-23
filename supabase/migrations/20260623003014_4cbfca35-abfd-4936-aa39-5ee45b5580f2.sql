ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_username TEXT,
  ADD COLUMN IF NOT EXISTS portal_password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS clients_portal_username_key
  ON public.clients (lower(portal_username))
  WHERE portal_username IS NOT NULL AND portal_username <> '';

CREATE OR REPLACE FUNCTION public.find_client_by_portal_username(_username TEXT)
RETURNS SETOF public.clients
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.clients
  WHERE lower(portal_username) = lower(_username)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.find_client_by_portal_username(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_client_by_portal_username(TEXT) TO service_role;