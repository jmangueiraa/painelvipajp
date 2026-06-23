CREATE OR REPLACE FUNCTION public.find_client_by_phone_digits(_digits TEXT)
RETURNS SETOF public.clients
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.clients
  WHERE regexp_replace(COALESCE(phone,''), '\D', '', 'g') LIKE '%' || right(_digits, 8)
  LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.find_client_by_phone_digits(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_client_by_phone_digits(TEXT) TO service_role;