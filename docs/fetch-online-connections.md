# Edge Function: `fetch-online-connections`

Esta função consulta em tempo real todos os clientes/conexões que estão assistindo agora no servidor IPTV / P2P (RBOYS), lendo as credenciais salvas de forma segura no banco de dados.

## Como fazer deploy no Supabase:

```bash
supabase functions deploy fetch-online-connections --no-verify-jwt
```

## Como testar:

```bash
curl -X GET "https://<SEU-PROJETO>.supabase.co/functions/v1/fetch-online-connections" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>"
```
