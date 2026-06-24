CREATE TABLE public.app_renewal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.app_plans(id) ON DELETE SET NULL,
  days integer NOT NULL,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment',
  mp_payment_id text,
  mp_status text,
  pix_qr_code text,
  pix_qr_base64 text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.app_renewal_requests TO authenticated;
GRANT ALL ON public.app_renewal_requests TO service_role;

ALTER TABLE public.app_renewal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own app renewal requests"
ON public.app_renewal_requests FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_app_renewal_requests_updated_at
BEFORE UPDATE ON public.app_renewal_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_app_renewal_requests_user ON public.app_renewal_requests(user_id);
CREATE INDEX idx_app_renewal_requests_mp ON public.app_renewal_requests(mp_payment_id);