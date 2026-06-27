-- Demote any reseller users back to regular users
DELETE FROM public.user_roles WHERE role = 'revendedor';

-- Drop reseller tracking columns
ALTER TABLE public.settings DROP COLUMN IF EXISTS reseller_user_id;
ALTER TABLE public.app_renewal_requests DROP COLUMN IF EXISTS reseller_user_id;
