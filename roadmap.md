# Preparação Android TWA

## Ações dos clientes RBOYS
- [x] Adicionar seis ações sem player, modais e confirmações, com servidor central do portal protegido (não Edge Function externa) e envio Evolution ao telefone vinculado.
- [x] Validar 8 testes de contratos; painel autenticado com 175 menus, 19 planos e mensagem de acesso real; celular sem transbordamento e alteração simulada atualizando lista/créditos, sem alterar clientes nem consumir créditos reais.

## WhatsApp Evolution API
- [x] Entregar send-whatsapp externa protegida e integrar a confirmação central de pagamento; 25 testes simulados aprovados, instruções e código completo entregues.
- [ ] Publicar send-whatsapp e atualização do portal/adaptador externo, depois validar novo pagamento real (depende da publicação no painel externo pelo proprietário).
- [x] Entregar adaptador completo do webhook externo com credenciais Evolution do proprietário, telefone 5516997855438 e redirect manual; 15 testes simulados aprovados, sem deploy/envio real. Dependência do processador publicado e limites de disputa com polling/reenvio documentados.
- [x] Corrigir seleção da credencial administrativa externa sem expor a API Key Evolution no navegador; integração usa servidor do próprio portal, não Edge Functions.
- [ ] Validar salvar/ler/status autenticados com instância real no banco externo (sessão do proprietário e tabela configurada necessárias).
- [x] Permitir espaços e hífens no nome da instância e verificar validação e codificação da URL.
- [x] Substituir os cards Z-API no portal e no painel mantendo o visual e o status de conexão.
- [x] Preparar armazenamento protegido por conta e ações de conexão da Evolution API.
- [x] Adaptar lembretes existentes; 7 testes aprovados e endpoints protegidos verificados sem envio real.
- [ ] Aplicar docs/evolution-setup.sql no banco externo: sem conexão SQL ou acesso de gerenciamento nesta sessão; service_role não executa DDL; depois validar conexão/envio com instância real.
- [ ] Configurar AUTO_CHARGES_SECRET no servidor e no agendador existente (depende do proprietário); chaves públicas não autorizam disparos.

## Confirmação Pix no portal
- [x] Substituir QR Code por confirmação após aprovação ou fatura paga, com ações de início e detalhes.
- [x] Validar regras de status (3 testes) e apresentação em celular e computador com pagamento simulado; confirmação real do Mercado Pago não testada.

- [x] Conferir manifesto web, ícones e formato oficial Bubblewrap.
- [x] Preparar configuração isolada e documentação em português.
- [x] Documentar assinatura, Digital Asset Links e testes Android.
- [x] Validar a configuração e confirmar preservação do portal (6 testes aprovados; campos oficiais 1.27.0 e comandos conferidos).
- [ ] Aplicar regras ao .gitignore: bloqueado por proteção da plataforma; regras entregues para aplicação manual.

## Etapa manual posterior
- Definir keystore, obter fingerprint SHA-256 real e publicar assetlinks.json no domínio.
- Gerar, assinar e testar o APK localmente antes de distribuir.