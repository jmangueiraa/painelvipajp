# Preparação Android TWA — AJP VIP

## Entrega
- Criar `android-twa/README.md` em português com instalação, inicialização, assinatura, geração local do APK e testes Android.
- Criar `android-twa/twa-manifest.json` conforme Bubblewrap 1.27.0, com os dados confirmados e os ícones HTTPS existentes.
- Documentar Digital Asset Links com fingerprint explicitamente pendente, sem publicar ou criar associação inválida.
- Proteger chaves, senhas e arquivos Android gerados pelo `.gitignore`.

## Detalhes técnicos
- Bubblewrap usa `launcherName` para o nome curto; não suporta um campo `shortName` ou idioma no manifesto TWA. O idioma pt-BR será documentado sem inventar campos.
- `init --manifest` exige a URL do manifesto web, não a página HTML. Usar `https://portalajp.com.br/portal-manifest.webmanifest`, que inicia `/portal/`, e aplicar a configuração Android confirmada após a inicialização.
- A configuração de assinatura terá placeholders para caminho/alias, substituídos apenas na cópia local gerada.
- Manter todos os arquivos de produção, manifesto web, pagamentos e publicação intactos. Os nomes e cores diferentes do manifesto atual serão sobrescritos apenas na configuração Android.

## Verificação e pendências
Verificar JSON, compatibilidade com o formato oficial e proteção de arquivos privados. Não gerar nem anunciar um APK nesta etapa.

Restarão: definir keystore, obter SHA-256 real, publicar `assetlinks.json` no domínio e gerar/testar o APK localmente.