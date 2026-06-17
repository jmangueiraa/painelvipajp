
-- Servers table
CREATE TABLE public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  credit_cost_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servers TO authenticated;
GRANT ALL ON public.servers TO service_role;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "servers_owner_all" ON public.servers FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_servers_updated_at BEFORE UPDATE ON public.servers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Clients extensions
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS iptv_login text,
  ADD COLUMN IF NOT EXISTS iptv_password text,
  ADD COLUMN IF NOT EXISTS server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_charge boolean NOT NULL DEFAULT true;

-- Settings extensions
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS pix_name text,
  ADD COLUMN IF NOT EXISTS pix_bank text,
  ADD COLUMN IF NOT EXISTS pix_message text,
  ADD COLUMN IF NOT EXISTS support_message text,
  ADD COLUMN IF NOT EXISTS whatsapp_instance text,
  ADD COLUMN IF NOT EXISTS subscription_expires_at date,
  ADD COLUMN IF NOT EXISTS subscription_monthly_cents integer NOT NULL DEFAULT 0;
