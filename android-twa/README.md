# AJP VIP — Android TWA com Bubblewrap

**Esta entrega não gerou nem contém um APK.** Prepara configuração e instruções para geração local, sem mudar comportamento, autenticação, rotas, pagamentos, banco, service workers ou publicação do portal.

TWA abre o site HTTPS no navegador compatível do Android. Não copia o banco nem cria uma experiência offline. Digital Asset Links valida a relação entre domínio e assinatura Android; sem vínculo válido, pode aparecer uma Custom Tab com barra do navegador.

## Arquivos e configuração

- `twa-manifest.json`: template conforme CLI/core **Bubblewrap 1.27.0**, versão atual consultada no npm em 11/11/2026; assinatura ainda pendente.
- `gitignore.rules`: regras para aplicação manual, **não ativas automaticamente**.
- `tests/config.test.mjs`: testes da preparação, não do APK.

| Parâmetro | Valor |
| --- | --- |
| Nome e nome curto | AJP VIP |
| Package/application ID | `br.com.ajpvip.portal` |
| Origem | `https://portalajp.com.br` |
| URL inicial | `https://portalajp.com.br/portal/` |
| Idioma esperado do conteúdo | `pt-BR` |
| Orientação / display | `portrait` / `standalone` |
| Tema (também no modo escuro Android) | `#FF5500` |
| Fundo / barra de navegação Android | `#F4F5F7` |

Recursos locais conferidos e reutilizados:

- `public/portal-manifest.webmanifest` → `https://portalajp.com.br/portal-manifest.webmanifest`
- `public/portal-icon-192.png` (192×192) → `https://portalajp.com.br/portal-icon-192.png`
- `public/portal-icon-512.png` (512×512) → `https://portalajp.com.br/portal-icon-512.png`

Bubblewrap exige ícone launcher de pelo menos 512×512; `iconUrl` e `maskableIconUrl` usam o 512, já declarado maskable no manifesto web. O 192 permanece no manifesto web. Confira o recorte no Android.

**Formato:** nome curto é `launcherName`, não `shortName`. Bubblewrap 1.27.0 não tem campo `lang`/`locale` no manifesto TWA; não inventamos um. Confira pt-BR no conteúdo exibido pelo portal. Os nomes e cores atuais do manifesto web diferem dos valores Android confirmados: **não altere o manifesto web**; aplique o template somente à configuração Android. Permanecem `id/start_url: /portal/`, `scope: /`, `display: standalone`.

Não são habilitados Play Billing, parâmetros extras na URL ou origens confiáveis adicionais. `enableNotifications: false` apenas deixa desligada a delegação nativa opcional; não modifica push/service workers web. Fallback é `customtabs`, não WebView.

## 1. Instalação e verificação do domínio

Use computador com Node.js LTS ainda suportado (mínimo declarado pela CLI: 18), npm, internet e espaço para JDK/SDK Android. Exemplos Bash Linux/macOS; adapte caminhos no Windows.

```bash
node --version
npm --version
npm install --global @bubblewrap/cli@1.27.0
bubblewrap --version
```

Não use `sudo npm install`. Na primeira execução, siga a configuração/download de JDK e Android SDK oferecida pela CLI e aceite as licenças aplicáveis. Para instalação manual, esta versão documenta JDK 17. Instale também Platform Tools/Build Tools para `adb` e `apksigner`.

Confira acesso público, HTTPS válido, ícones PNG e manifesto JSON (não HTML/login):

```bash
curl -sS -D - -o /dev/null https://portalajp.com.br/portal/
curl -fsS https://portalajp.com.br/portal-manifest.webmanifest
curl -sS -D - -o /dev/null https://portalajp.com.br/portal-icon-192.png
curl -sS -D - -o /dev/null https://portalajp.com.br/portal-icon-512.png
bubblewrap validate --url=https://portalajp.com.br/portal/
```

A disponibilidade pública e o vínculo precisam ser confirmados antes de distribuir. Se houver problema, interrompa: esta preparação não autoriza alterar o site nem redirecionar o app ao endereço Lovable.

## 2. Segurança e assinatura

**A plataforma bloqueou a edição automática do `.gitignore`.** Aplique manualmente as regras de `android-twa/gitignore.rules` quando permitido e confirme sua eficácia com `git check-ignore`. Até isso ocorrer, elas **não protegem** arquivos no repositório. O procedimento abaixo gera tudo **fora do repositório**, inclusive o projeto Android, evitando depender dessa alteração.

Nunca comite keystore, senhas, arquivos de assinatura, contas de serviço ou binários. Confira sempre `git status` e `git diff --cached`; regras de extensão não protegem segredos colados em texto/código. Não force inclusão de arquivos privados no Git.

Reutilize a keystore existente se já houver app distribuído com esse package. Para primeira distribuição, exemplo opcional de criação, com senhas solicitadas interativamente:

```bash
mkdir -p "$HOME/.ajp-vip-signing"
chmod 700 "$HOME/.ajp-vip-signing"
keytool -genkeypair -v \
  -keystore "$HOME/.ajp-vip-signing/ajp-vip-release.keystore" \
  -alias ajp-vip-release -keyalg RSA -keysize 2048 -validity 10000
chmod 600 "$HOME/.ajp-vip-signing/ajp-vip-release.keystore"
```

Este caminho/alias é uma sugestão, não uma chave criada. Informe dados reais do responsável. Armazene senhas em gerenciador e backup criptografado da chave em local separado, com acesso restrito. Perder/trocar a chave pode impedir atualizações de APKs distribuídos diretamente. Não regenere a chave a cada build.

## 3. Inicialização local

Abra um terminal na raiz deste repositório. Guarde o caminho e escolha uma pasta externa **nova e vazia**:

```bash
export AJP_REPO="$PWD"
export AJP_ANDROID="$HOME/ajp-vip-android-local"
mkdir -p "$AJP_ANDROID"
bubblewrap init \
  --manifest=https://portalajp.com.br/portal-manifest.webmanifest \
  --directory="$AJP_ANDROID"
```

**`--manifest` recebe o manifesto web, não HTML.** Não use `--manifest=https://portalajp.com.br/portal/`: essa é a página inicial, não o arquivo JSON. O manifesto existente inicia `/portal/`.

No assistente, confirme host `portalajp.com.br`, início `/portal/`, package `br.com.ajpvip.portal`, nome/nome curto AJP VIP e portrait. Informe caminho **absoluto** da keystore real e alias correto. Use a chave definida na etapa 2 e não habilite integrações extras.

Após o assistente, aplique os dados Android confirmados preservando assinatura, versões e fingerprints reais da cópia local. Ainda no mesmo terminal:

```bash
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const template = JSON.parse(fs.readFileSync(path.join(process.env.AJP_REPO, 'android-twa/twa-manifest.json'), 'utf8'));
const output = path.join(process.env.AJP_ANDROID, 'twa-manifest.json');
const local = JSON.parse(fs.readFileSync(output, 'utf8'));
if (!local.signingKey?.path || !local.signingKey?.alias ||
    !path.isAbsolute(local.signingKey.path) ||
    local.signingKey.path.includes('__DEFINIR') ||
    local.signingKey.alias.includes('__DEFINIR') ||
    !fs.existsSync(local.signingKey.path)) {
  throw new Error('Defina caminho absoluto da keystore real e alias na cópia local.');
}
const result = {
  ...local, ...template,
  signingKey: local.signingKey,
  appVersion: local.appVersion,
  appVersionCode: local.appVersionCode,
  fingerprints: local.fingerprints || [],
};
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
NODE
cd "$AJP_ANDROID"
bubblewrap update --skipVersionUpgrade
```

Confira a cópia local antes do build. `signingKey.path` e `alias` são obrigatórios no formato oficial; placeholders `__DEFINIR...__` do template **não são válidos para assinatura**. Não copie o template inteiro por cima da identidade real. As versões 1.0.0/código 1 são propostas iniciais; preserve as versões locais escolhidas e incremente o código nas próximas distribuições.

`update` pode sobrescrever arquivos Android gerados. Não execute `init`, `update` ou `build` na raiz do portal. Este projeto externo é independente do build/publicação web.

## 4. Digital Asset Links

O administrador do domínio deverá publicar:

```text
https://portalajp.com.br/.well-known/assetlinks.json
```

Exigir HTTPS válido, **HTTP 200**, MIME **`application/json`**, sem autenticação, **sem redirecionamentos** e sem retornar HTML. `www` e outros subdomínios são origens distintas; a associação deve estar na origem exata.

Obtenha o fingerprint do certificado de assinatura real (senha interativa):

```bash
keytool -list -v \
  -keystore "$HOME/.ajp-vip-signing/ajp-vip-release.keystore" \
  -alias ajp-vip-release
```

Copie **SHA-256**, não SHA-1/MD5/hash do arquivo ou chave do banco. O valor real contém 32 pares hexadecimais separados por `:`. Use a mesma chave/alias do APK.

Modelo somente documental; substitua o placeholder **antes** de salvar/publicar. Nenhum `assetlinks.json` foi criado em produção nesta entrega:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "br.com.ajpvip.portal",
      "sha256_cert_fingerprints": ["SUBSTITUIR_PELO_SHA256_REAL_DO_CERTIFICADO"]
    }
  }
]
```

O placeholder não é um fingerprint válido. Publique separadamente na hospedagem do domínio, sem alterar a publicação atual nesta etapa. Fingerprint é público; keystore/chave privada e senhas não são.

Se futuramente usar **Play App Signing**, adicione o SHA-256 do certificado de **assinatura do app** no Play Console, não só a chave de upload. Para APK direto, vale o certificado que assinou esse APK. O array pode conter múltiplos fingerprints reais para as assinaturas efetivamente distribuídas. Políticas/aprovação Google Play e pagamentos de conteúdo digital são etapas separadas; não foi implementado Play Billing nem alterado Mercado Pago.

## 5. Verificar vínculo e gerar APK

Confira o endpoint **sem `curl -L`**, que esconderia redirecionamentos:

```bash
curl -sS -D /tmp/ajp-assetlinks-headers.txt \
  -o /tmp/ajp-assetlinks.json \
  https://portalajp.com.br/.well-known/assetlinks.json
cat /tmp/ajp-assetlinks-headers.txt
node -e 'JSON.parse(require("node:fs").readFileSync("/tmp/ajp-assetlinks.json", "utf8")); console.log("JSON válido")'
```

JSON válido sozinho não prova associação. Confira status, MIME, relation, package e fingerprint. Consulte a API Google substituindo o placeholder pelo SHA-256 real:

```bash
curl -fsS -G 'https://digitalassetlinks.googleapis.com/v1/assetlinks:check' \
  --data-urlencode 'source.web.site=https://portalajp.com.br' \
  --data-urlencode 'relation=delegate_permission/common.handle_all_urls' \
  --data-urlencode 'target.androidApp.packageName=br.com.ajpvip.portal' \
  --data-urlencode 'target.androidApp.certificate.sha256Fingerprint=SUBSTITUIR_PELO_SHA256_REAL_DO_CERTIFICADO'
```

Espere `linked: true`. Se vier false, investigue DNS, cache, redirects, package e certificado. Esse resultado não substitui testar no aparelho.

Na pasta Android externa, após definir assinatura e atualizar os arquivos:

```bash
cd "$AJP_ANDROID"
bubblewrap build
```

Digite senhas nos prompts, não em comandos/scripts versionados. A CLI também aceita `BUBBLEWRAP_KEYSTORE_PASSWORD` e `BUBBLEWRAP_KEY_PASSWORD`; se automatizar, injete por cofre de segredos sem logs, nunca pelo repositório.

Após sucesso local, confira os arquivos produzidos. O APK assinado esperado é `app-release-signed.apk`; a CLI também pode gerar AAB. Não distribua APK não assinado. Verifique o certificado com o `apksigner` do Android SDK Build Tools (use caminho completo se não estiver no PATH):

```bash
apksigner verify --verbose --print-certs app-release-signed.apk
```

Compare seu SHA-256 com o publicado. Não use `--skipSigning` ou `--skipPwaValidation` para declarar o app pronto.

## 6. Teste Android antes de distribuir

Use aparelho/emulador com navegador TWA compatível atualizado (por exemplo Chrome). Ative depuração USB, autorize o computador e instale via Platform Tools:

```bash
adb devices
# Na pasta Android externa, após gerar o APK:
bubblewrap install --apkFile=./app-release-signed.apk
# Alternativa: adb install -r ./app-release-signed.apk
adb shell am start -n br.com.ajpvip.portal/.LauncherActivity
```

Checklist:

- Abrir pelo ícone AJP VIP; conferir origem, `/portal/`, portrait e recorte do ícone.
- Confirmar ausência da barra do navegador **na origem confiável** com associação válida. Se houver barra, verificar certificado/package/assetlinks/navegador; não desabilitar validação de origem no teste final.
- Fazer login com conta real autorizada, navegar, sair, reabrir e conferir sessão. TWA usa a sessão do navegador escolhido; não presume compartilhamento com outro navegador. Não alterar usuários/senhas para esta preparação.
- Testar voltar do Android, alternar apps e retorno de links externos. Mercado Pago/WhatsApp não são origens confiáveis adicionadas; podem exibir interface do navegador, comportamento esperado.
- Testar PIX/cartão pelo procedimento de testes autorizado pelo responsável, evitando cobranças reais involuntárias; verificar retorno e confirmação reais. Empacotamento não comprova pagamentos.
- Conferir push/permissões web, retomada e falta de rede conforme o portal atual; não foi criado offline novo.
- Repetir com o certificado/APK exato a distribuir. Testar atualização de uma versão anterior com a mesma assinatura.

Diagnóstico: `adb logcat` e inspeção Chrome em `chrome://inspect/#devices`. Sanitize tokens/dados pessoais antes de compartilhar logs. `adb shell pm get-app-links br.com.ajpvip.portal` pode ajudar se houver intent filters App Links no projeto gerado, mas App Links Android e validação TWA do navegador não são a mesma prova. Confira associação, certificado e abertura real em conjunto.

## 7. Verificações e pendências desta entrega

Na raiz do repositório:

```bash
node --test android-twa/tests/config.test.mjs
git status --short
# Após aplicar manualmente gitignore.rules:
git check-ignore android-twa/generated/twa-manifest.json android-twa/generated/app-release-signed.apk
```

Esses testes verificam somente a preparação, **não geram APK**.

Passos manuais restantes:

1. Aplicar as regras do Git quando permitido; até lá, manter projeto gerado/segredos fora do repositório.
2. Confirmar URLs públicas, instalar ferramentas e definir/guardar keystore.
3. Obter fingerprint SHA-256 real e publicar/verificar `assetlinks.json` no domínio.
4. Inicializar externamente, aplicar template preservando assinatura/versão e gerar APK assinado.
5. Conferir certificado, vínculo e fluxos reais no Android antes de distribuir.

Referências:

- [Bubblewrap CLI 1.27.0](https://www.npmjs.com/package/@bubblewrap/cli/v/1.27.0)
- [Bubblewrap oficial](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli#readme) (main pode evoluir; esta preparação usa 1.27.0)
- [TWA início rápido](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [Digital Asset Links](https://developers.google.com/digital-asset-links/v1/getting-started)