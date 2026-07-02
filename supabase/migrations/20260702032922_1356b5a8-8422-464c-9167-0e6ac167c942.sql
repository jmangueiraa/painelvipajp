
-- Motoristas
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  vehicle TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages drivers" ON public.drivers FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "driver reads own" ON public.drivers FOR SELECT
  USING (auth_user_id = auth.uid());

-- Rotas
CREATE TABLE public.delivery_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Rota',
  status TEXT NOT NULL DEFAULT 'draft', -- draft | active | completed | canceled
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  origin_address TEXT,
  distance_meters INT,
  duration_seconds INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_routes TO authenticated;
GRANT ALL ON public.delivery_routes TO service_role;
ALTER TABLE public.delivery_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages routes" ON public.delivery_routes FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "driver reads own route" ON public.delivery_routes FOR SELECT
  USING (driver_id IN (SELECT id FROM public.drivers WHERE auth_user_id = auth.uid()));
CREATE POLICY "driver updates own route" ON public.delivery_routes FOR UPDATE
  USING (driver_id IN (SELECT id FROM public.drivers WHERE auth_user_id = auth.uid()));

-- Entregas
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.delivery_routes(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  sequence INT,
  customer_name TEXT NOT NULL,
  phone TEXT,
  address TEXT NOT NULL,
  neighborhood TEXT,
  city TEXT,
  zip TEXT,
  notes TEXT,
  window_start TIME,
  window_end TIME,
  value_cents INT NOT NULL DEFAULT 0,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  geocoded_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | in_route | delivered | failed
  delivered_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages deliveries" ON public.deliveries FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "driver reads assigned" ON public.deliveries FOR SELECT
  USING (driver_id IN (SELECT id FROM public.drivers WHERE auth_user_id = auth.uid()));
CREATE POLICY "driver updates assigned" ON public.deliveries FOR UPDATE
  USING (driver_id IN (SELECT id FROM public.drivers WHERE auth_user_id = auth.uid()));

CREATE INDEX ON public.deliveries(user_id, status);
CREATE INDEX ON public.deliveries(route_id, sequence);

-- Localizações do motorista (tracking)
CREATE TABLE public.driver_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.delivery_routes(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.driver_locations TO authenticated;
GRANT ALL ON public.driver_locations TO service_role;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads locations" ON public.driver_locations FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "driver inserts own location" ON public.driver_locations FOR INSERT
  WITH CHECK (driver_id IN (SELECT id FROM public.drivers WHERE auth_user_id = auth.uid()));
CREATE POLICY "driver reads own locations" ON public.driver_locations FOR SELECT
  USING (driver_id IN (SELECT id FROM public.drivers WHERE auth_user_id = auth.uid()));
CREATE INDEX ON public.driver_locations(driver_id, recorded_at DESC);

-- Comprovantes
CREATE TABLE public.delivery_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  photo_path TEXT,
  signature_path TEXT,
  received_by TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.delivery_proofs TO authenticated;
GRANT ALL ON public.delivery_proofs TO service_role;
ALTER TABLE public.delivery_proofs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads proofs" ON public.delivery_proofs FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "driver inserts proof" ON public.delivery_proofs FOR INSERT
  WITH CHECK (delivery_id IN (
    SELECT d.id FROM public.deliveries d
    JOIN public.drivers dr ON dr.id = d.driver_id
    WHERE dr.auth_user_id = auth.uid()
  ));
CREATE POLICY "driver reads own proofs" ON public.delivery_proofs FOR SELECT
  USING (delivery_id IN (
    SELECT d.id FROM public.deliveries d
    JOIN public.drivers dr ON dr.id = d.driver_id
    WHERE dr.auth_user_id = auth.uid()
  ));

-- Histórico de ações
CREATE TABLE public.delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE,
  route_id UUID REFERENCES public.delivery_routes(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.delivery_logs TO authenticated;
GRANT ALL ON public.delivery_logs TO service_role;
ALTER TABLE public.delivery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads logs" ON public.delivery_logs FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "owner inserts logs" ON public.delivery_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "driver inserts own logs" ON public.delivery_logs FOR INSERT
  WITH CHECK (driver_id IN (SELECT id FROM public.drivers WHERE auth_user_id = auth.uid()));

-- Triggers updated_at
CREATE TRIGGER trg_drivers_updated BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_routes_updated BEFORE UPDATE ON public.delivery_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Role de motorista
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'driver') THEN
    ALTER TYPE public.app_role ADD VALUE 'driver';
  END IF;
END $$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
