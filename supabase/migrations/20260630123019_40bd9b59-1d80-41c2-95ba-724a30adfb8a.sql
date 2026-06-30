
CREATE TABLE public.notifications_config (
  id text PRIMARY KEY DEFAULT 'global',
  notify_new_sale boolean NOT NULL DEFAULT true,
  notify_payment_approved boolean NOT NULL DEFAULT true,
  notify_renewal boolean NOT NULL DEFAULT true,
  notify_new_client boolean NOT NULL DEFAULT true,
  notify_trial boolean NOT NULL DEFAULT true,
  notify_payment_rejected boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications_config TO authenticated;
GRANT ALL ON public.notifications_config TO service_role;
ALTER TABLE public.notifications_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage notifications_config" ON public.notifications_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.notifications_config (id) VALUES ('global') ON CONFLICT DO NOTHING;
