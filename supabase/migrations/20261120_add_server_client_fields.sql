-- Adiciona campos para vínculo direto com o servidor IPTV / P2P (RBOYS)
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS server_client_id TEXT,
ADD COLUMN IF NOT EXISTS server_plan_id TEXT,
ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'iptv';

-- Recarrega o cache de esquemas do PostgREST
NOTIFY pgrst, 'reload schema';
