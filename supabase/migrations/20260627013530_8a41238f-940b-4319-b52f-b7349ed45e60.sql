ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS reseller_user_id uuid;
ALTER TABLE public.app_renewal_requests ADD COLUMN IF NOT EXISTS reseller_user_id uuid;
CREATE INDEX IF NOT EXISTS idx_settings_reseller ON public.settings(reseller_user_id);
CREATE INDEX IF NOT EXISTS idx_app_renewal_reseller ON public.app_renewal_requests(reseller_user_id);