
INSERT INTO public.payments (client_id, user_id, amount_cents, paid_at, method, notes)
VALUES (
  '38f554bf-4a6a-406f-9d13-cc240e35458e',
  '56c1b7f4-8073-4bd3-9109-5adecb2a0c91',
  6000,
  '2026-07-01 01:02:20+00',
  'pix_mercadopago',
  'Renovação 30 dias - Mercado Pago (reprocessado)'
);

UPDATE public.clients
SET due_date = '2026-07-31'
WHERE id = '38f554bf-4a6a-406f-9d13-cc240e35458e';
