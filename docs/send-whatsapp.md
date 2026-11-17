# Edge Function: `send-whatsapp` (Código Corrigido com Valor Líquido do Mercado Pago)

Esta Edge Function deve ser publicada no seu Supabase externo (`https://zfafucaxbktpifydecng.supabase.co/functions/v1/send-whatsapp`).

## O que causava o erro `Status MP: Token MP recusado (HTTP 401)` e o valor estimado:
1. **Falta do prefixo `Bearer` ou token indefinido:** No Mercado Pago, requisições de pagamento exigem obrigatoriamente o header `Authorization: Bearer APP_USR-...`. Se o token for passado sem `Bearer` ou se tentar ler uma variável de ambiente não configurada, o Mercado Pago rejeita com `HTTP 401 Unauthorized`.
2. **Endpoint de Saldo da Conta vs Valor Líquido do Pagamento:** O endpoint de saldo geral de carteira do Mercado Pago (`/mercadopago_account/balance`) retorna `403 Forbidden` para credenciais comuns de vendedor. O valor líquido real da transação é retornado em `https://api.mercadopago.com/v1/payments/{payment_id}` no campo:
   - `transaction_details.net_received_amount`: Valor líquido creditado na sua conta (ex: **R$ 1,98**).
   - `fee_details`: Taxa descontada pelo Mercado Pago (ex: **R$ 0,02**).
   - `transaction_amount`: Valor bruto pago pelo cliente (ex: **R$ 2,00**).

## Como aplicar a correção:
1. Abra o painel do seu Supabase em **Edge Functions** → **send-whatsapp**.
2. Substitua o conteúdo do `index.ts` pelo código de `docs/send-whatsapp.ts`.
3. Clique em **Deploy** ou publique via CLI.
4. Garanta que nas configurações da função esteja desativado o "Enforce JWT Verification" (para aceitar chamadas com a chave anon do portal) e que o CORS esteja ativo.

## Formato da Mensagem WhatsApp Gerada:
```
💰 NOVA RENOVAÇÃO RECEBIDA — AJP VIP

👤 Cliente: adm
🔑 Usuário: adm
📱 WhatsApp: (16) 99785-5438
💵 Valor bruto: R$ 2,00
🏷️ Taxa MP: R$ 0,02
💚 Valor líquido MP: R$ 1,98
⌛ Período: +30 dias
```
