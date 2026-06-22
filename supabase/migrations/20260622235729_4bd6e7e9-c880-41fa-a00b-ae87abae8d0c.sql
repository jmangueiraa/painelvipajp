
REVOKE EXECUTE ON FUNCTION public.apply_referral_bonus() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_client_referral_code() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gen_referral_code(TEXT) FROM anon, authenticated, PUBLIC;
