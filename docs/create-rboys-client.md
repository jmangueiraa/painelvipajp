# Edge Function: `create-rboys-client`

Criação e geração de testes/clientes oficiais diretamente no servidor RBOYS (IPTV ou P2P), já vinculando no banco local do AJPVIP.

## Como publicar no Supabase:

```bash
supabase functions deploy create-rboys-client --no-verify-jwt
```

## Como usar:

```bash
# Buscar planos do servidor:
curl -X POST "https://<SEU-PROJETO>.supabase.co/functions/v1/create-rboys-client" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"action": "get_plans", "type": "IPTV"}'

# Criar cliente ou teste:
curl -X POST "https://<SEU-PROJETO>.supabase.co/functions/v1/create-rboys-client" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "IPTV",
    "is_trial": true,
    "plan_id": "1",
    "name": "Cliente Teste",
    "phone": "16999999999",
    "notes": "Teste solicitado via painel"
  }'
```
