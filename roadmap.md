# Preparação Android TWA

## WhatsApp Evolution API
- [x] Substituir os cards Z-API no portal e no painel mantendo o visual e o status de conexão.
- [x] Preparar armazenamento protegido por conta e ações de conexão da Evolution API.
- [x] Adaptar lembretes existentes; 7 testes aprovados e endpoints protegidos verificados sem envio real.
- [ ] Aplicar docs/evolution-setup.sql no banco externo e validar conexão/envio com instância real (depende de acesso e credenciais).
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