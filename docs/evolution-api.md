# Evolution API no Portal AJP VIP

Esta integração usa Evolution API v2: `GET /instance/connectionState/{instância}`, `GET /instance/connect/{instância}`, `DELETE /instance/logout/{instância}` e `POST /message/sendText/{instância}`. A autenticação usa o cabeçalho `apikey`, enviado somente pelo servidor.

## Ativação no banco externo existente

1. Execute `docs/evolution-setup.sql` no editor SQL do banco já utilizado (`zfafucaxbktpifydecng`). O script cria somente a tabela de integração, sem modificar clientes, pagamentos ou credenciais anteriores. A chave `service_role` permite operações de dados, mas não execução de DDL; aplicar a migração exige o editor SQL, uma conexão PostgreSQL ou acesso autorizado à API de gerenciamento. Não execute todas as migrações históricas para esta etapa.
2. Confirme que o servidor tem a credencial administrativa **do mesmo banco externo**. A chave pública não permite ler ou salvar a chave privada da Evolution.
3. No Portal do Cliente, entre como administrador → API e Integrações. Salve a URL HTTPS pública (sem barra final), o nome da instância existente e sua API Key. O nome aceita letras, números, espaços internos, hífens e sublinhados, até 100 caracteres; espaços nas extremidades são removidos, sem substituir espaços internos por hífens. Informe exatamente o nome cadastrado na Evolution.
4. Consulte Status e escaneie o QR Code no WhatsApp. Somente `instance.state = open` aparece como Conectado.
5. Teste uma cobrança com um contato autorizado antes de liberar envios automáticos.

## Alertas existentes

Os lembretes existentes de cobrança usam a Evolution quando a conta do cliente possui configuração salva; contas sem Evolution conservam o envio anterior. Os filtros e datas de cobrança não foram alterados. Esta etapa não cria um novo calendário de alertas nem dispara mensagens durante a configuração.

O agendamento externo precisa continuar chamando `/api/public/hooks/auto-charges`. Configure `AUTO_CHARGES_SECRET` no servidor e envie o mesmo segredo no cabeçalho `Authorization: Bearer <segredo>` do agendador; uma chave pública do banco não autoriza mais envios em massa. Nunca grave esse segredo no repositório. A configuração do agendador e o envio real precisam de validação no ambiente do proprietário.

As chaves não são retornadas no painel, não entram em `settings` nem em respostas públicas. Deixar a chave vazia ao editar conserva a chave salva. Não comite credenciais reais, nem faça prints do campo revelado.