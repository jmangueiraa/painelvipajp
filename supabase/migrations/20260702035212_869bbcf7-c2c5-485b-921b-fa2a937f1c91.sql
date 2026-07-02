DROP TABLE IF EXISTS public.delivery_proofs CASCADE;
DROP TABLE IF EXISTS public.delivery_logs CASCADE;
DROP TABLE IF EXISTS public.driver_locations CASCADE;
DROP TABLE IF EXISTS public.delivery_routes CASCADE;
DROP TABLE IF EXISTS public.deliveries CASCADE;
DROP TABLE IF EXISTS public.drivers CASCADE;
DROP FUNCTION IF EXISTS public.link_driver_to_current_user(text);