# Webhook externo Mercado Pago → Evolution

`mp-webhook-evolution.ts` é o código completo de um **adaptador para a função externa**, não uma cópia da função atualmente publicada no seu banco: esse código externo não está disponível no repositório. O webhook encontrado é `src/routes/api/public/portal/mp-webhook.ts`, que chama `finalizePaidRenewal`; hoje esse finalizador envia Telegram/push, mas não WhatsApp.

O adaptador confirma a assinatura e consulta o pagamento no Mercado Pago com o token do proprietário. Em seguida chama o processador existente do portal para preservar renovação, datas de vencimento, histórico financeiro, Telegram, compras, comissões e push. Só depois de o processador confirmar o pagamento ele busca `public.evolution_integrations` por `user_id` do mesmo proprietário e envia ao telefone desse cliente. Não procura a primeira integração disponível e não usa credenciais de outra conta.

## Como aplicar

1. Faça uma cópia do código da Edge Function externa atual antes de substituir. Se ela contém processamento adicional não existente no portal, não a substitua integralmente: incorpore somente `normalizeBrazilPhone`, `evolutionSendRequest` e o bloco de leitura/envio Evolution ao fluxo atual.
2. No Supabase externo → Edge Functions → sua função de webhook, cole o conteúdo completo de `mp-webhook-evolution.ts` no `index.ts`.
3. Configure os secrets **na função externa**, não apenas no Lovable:
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: valores do banco externo; normalmente já fornecidos pelo Supabase. Nunca use anon/publishable como credencial administrativa.
   - `MP_WEBHOOK_SECRET`: assinatura secreta fornecida na configuração de Webhooks do Mercado Pago. Este adaptador aceita uma assinatura configurada; contas Mercado Pago com assinaturas diferentes exigem resolver a assinatura por proprietário antes da validação.
   - `PORTAL_PAYMENT_PROCESSOR_URL`: `https://painelvipajp.lovable.app/api/public/portal/mp-webhook` (ou o domínio publicado equivalente). Deve usar **o mesmo banco externo** e suas credenciais administrativas. Não aponte para a própria Edge Function.
4. Desative a verificação JWT da função (`verify_jwt = false`) porque o Mercado Pago não envia JWT Supabase. A validação da assinatura Mercado Pago continua obrigatória no código; não a remova.
5. Publique a função externa. Mantenha o nome/URL do webhook já cadastrado no Mercado Pago; não altere rotas ou banco do portal.
6. Confirme que a tabela Evolution já existe, tem `base_url`, `instance_name`, `api_key`, `user_id`, e que a instância do proprietário está conectada. Teste com **novo pagamento autorizado** em uma conta com a assinatura configurada.

## Regras verificadas

- `(16) 99785-5438`, `16997855438` e `+55 (16) 99785-5438` viram `5516997855438`, sem duplicar o 55.
- POST em `/message/sendText/${encodeURIComponent(instance_name)}`, com `apikey` no servidor e `redirect: "manual"`. Redirecionamentos HTTP não são seguidos: corrija a URL base no painel se houver 301/302.
- Apenas `approved`, com referência, proprietário, identificador e valor conferidos na API Mercado Pago. `pending`/`in_process` não enviam WhatsApp.
- Repetições já processadas não renovam nem enviam novamente. Mensagens são aceitas pela API, não necessariamente entregues ao aparelho.

## Limites importantes

Não houve deploy nem teste com pagamento real nesta entrega. O processador publicado precisa estar acessível e ligado ao banco correto. Este adaptador depende dele; não é um substituto independente de todas as regras de pagamento do portal.

A renovação atual é marcada como paga antes das notificações. Se o polling do portal vencer a disputa, a função retorna `already processed` e não envia WhatsApp; se a Evolution falhar após a confirmação, repetir o webhook também não reenvia. Um pagamento antigo já notificado no Telegram não será reenviado automaticamente. Para garantia de entrega com tentativas independentes, é necessária uma fila persistente por pagamento/canal integrada também ao polling (não criada nesta entrega). Evite reabrir a fatura ou reprocessar a renovação para tentar reenviar uma mensagem.

Validação: testes automatizados com respostas simuladas de banco, Mercado Pago, processador e Evolution; nenhum cliente recebeu mensagem nos testes.