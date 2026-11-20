# Edge Function: `fetch-server-credits`

Consulta em tempo real o **saldo de créditos da conta no servidor IPTV / P2P (RBOYS)** via `GET {base_url}/me` enviando o header `X-API-Key`.

## Como publicar no Supabase:

```bash
supabase functions deploy fetch-server-credits --no-verify-jwt
```

## Como testar:

```bash
curl -X POST "https://<SEU-PROJETO>.supabase.co/functions/v1/fetch-server-credits" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>"
```

## Retorno esperado:

```json
{
  "ok": true,
  "configured": true,
  "server_name": "RBOYS",
  "base_url": "https://cms.rboys02.click/api/v1",
  "status": 200,
  "latencyMs": 115,
  "credits": 50.0,
  "formatted_credits": "50.00",
  "is_low_balance": false,
  "name": "Augusto",
  "username": "augusto"
}
```
