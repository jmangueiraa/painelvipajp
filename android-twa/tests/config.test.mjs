import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../twa-manifest.json', import.meta.url), 'utf8'));
const web = JSON.parse(readFileSync(new URL('../../public/portal-manifest.webmanifest', import.meta.url), 'utf8'));

test('Package ID confirmado', () => {
  assert.equal(manifest.packageId, 'br.com.ajpvip.portal');
});
test('Origem e URL inicial confirmadas, sem parâmetros extras', () => {
  assert.equal(manifest.host, 'portalajp.com.br');
  assert.equal(manifest.startUrl, '/portal/');
  assert.equal(new URL(manifest.startUrl, `https://${manifest.host}`).href, 'https://portalajp.com.br/portal/');
});
test('Reutiliza ícones e manifesto existentes por HTTPS', () => {
  assert.equal(manifest.iconUrl, 'https://portalajp.com.br/portal-icon-512.png');
  assert.equal(manifest.maskableIconUrl, manifest.iconUrl);
  assert.equal(manifest.webManifestUrl, 'https://portalajp.com.br/portal-manifest.webmanifest');
  for (const size of [192, 512]) {
    assert.ok(web.icons.some(icon => icon.src === `/portal-icon-${size}.png`));
  }
});
test('Assinatura pendente, sem fingerprint inventado', () => {
  assert.deepEqual(manifest.fingerprints, []);
  assert.deepEqual(manifest.signingKey, {
    path: '__DEFINIR_CAMINHO_ABSOLUTO_DA_KEYSTORE__',
    alias: '__DEFINIR_ALIAS_DA_CHAVE__',
  });
});
test('Não adiciona origens confiáveis nem delegação nativa de pagamentos/push', () => {
  assert.deepEqual(manifest.additionalTrustedOrigins, []);
  assert.deepEqual(manifest.features, {});
  assert.equal(manifest.enableNotifications, false);
  assert.equal(manifest.fallbackType, 'customtabs');
});
test('Contrato de navegação do manifesto web preservado', () => {
  assert.equal(web.id, '/portal/');
  assert.equal(web.start_url, '/portal/');
  assert.equal(web.scope, '/');
  assert.equal(web.display, 'standalone');
});