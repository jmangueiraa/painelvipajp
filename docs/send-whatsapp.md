# send-whatsapp — código completo para o Supabase externo

Cole **todo o conteúdo de `send-whatsapp.ts`** no `index.ts` de uma nova Edge Function chamada **send-whatsapp** no seu painel Supabase e publique a função.

## Configuração

- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` normalmente já são fornecidos automaticamente no ambiente da função. Devem corresponder ao banco externo que contém os pagamentos e `public.evolution_integrations`.
- Configure **verify_jwt = false** para aceitar também chaves administrativas modernas `sb_secret_`. A função NÃO fica pública: o código exige que o header `apikey` (ou Bearer) corresponda exatamente à chave administrativa. Não remova essa validação.
- Não coloque essa chave no navegador, no código do aplicativo, nem no formulário Evolution.
- A tabela precisa existir e conceder SELECT a `service_role` para as colunas usadas. RLS não substitui GRANT. A configuração existente em `evolution-setup.sql` já inclui os privilégios administrativos; esta entrega não altera políticas nem cria banco.
- Configure a URL base HTTPS e instância conectada da Evolution no painel existente.

## Fluxo integrado

O finalizador central do portal agora chama `POST https://SEU-BANCO.supabase.co/functions/v1/send-whatsapp` **no servidor**, após marcar um pagamento aprovado como pago e disparar Telegram. O corpo é somente:

```json
{ "renewal_id": "UUID-DA-RENOVACAO" }
```

A função verifica a credencial administrativa, consulta a renovação paga com `mp_status = approved`, deriva o proprietário do registro e lê o contato e `base_url`, `instance_name`, `api_key` exclusivamente desse proprietário. Não aceita telefone, dono ou texto arbitrários do navegador. Envia o número sem máscara — `(16) 99785-5438` vira `5516997855438` — com `POST /message/sendText/${encodeURIComponent(instance_name)}`, header `apikey` e `redirect: "manual"`.

O mesmo finalizador atende webhook Mercado Pago, atualização da fatura e cartão. A disputa atômica já existente evita que dois caminhos enviem na mesma confirmação. Telegram, vencimento fixo, comissões e push permanecem no portal.

**Publique também a atualização do portal.** Se usa o adaptador externo `mp-webhook-evolution.ts`, atualize-o com a versão desta entrega: ele reconhece a tentativa feita pelo portal e não envia uma segunda mensagem. Se o seu webhook externo não delega ao portal, acrescente uma chamada administrativa a send-whatsapp após a confirmação aprovada no seu processador; não ative os dois caminhos para a mesma confirmação.

## Validação e limites

Testes automatizados usam respostas simuladas; não houve deploy da função externa nem envio ou pagamento real. Um retorno `accepted` significa aceitação pela Evolution, não entrega garantida ao aparelho.

Sem fila persistente, falhas/timeout não têm reenvio automático; a fatura continua paga. Pagamentos antigos não disparam retroativamente. Chamadas administrativas manuais repetidas a send-whatsapp podem reenviar a mensagem: a função não armazena recibo de entrega. Nunca reabra uma fatura para reenviar WhatsApp.