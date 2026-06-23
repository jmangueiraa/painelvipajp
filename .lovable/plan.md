# Portal do Cliente + Indicação Premiada

## O que será entregue

**1. Portal do Cliente** (rotas públicas, sem login no painel principal)
- `/portal` — tela de login: cliente digita WhatsApp, recebe código de 6 dígitos via Z-API, confirma e entra
- `/portal/painel` — vê plano atual, vencimento, status, valor, histórico de pagamentos, último login IPTV
- Botão "Renovar agora" — abre escolha de período (mensal/trimestral/semestral/anual) com Pix manual (você pode evoluir para Pix automático depois)
- Botão "Baixar comprovante" para cada pagamento (PDF simples gerado no cliente)
- Sessão fica salva no navegador por 30 dias (token assinado)

**2. Indicação Premiada**
- Cada cliente recebe automaticamente um **código de indicação único** (ex.: `JOAO-A4F2`)
- Dentro do portal: tela "Indique e ganhe" com o link `https://seudominio/portal?ref=JOAO-A4F2` + botão "Compartilhar no WhatsApp"
- Quando o indicado paga a 1ª renovação, o indicador ganha **X dias grátis** automaticamente (configurável em Configurações → padrão 7 dias)
- Painel mostra: total de indicações, indicações pagas, dias ganhos

## Estrutura técnica

### Banco (migration)
- `clients`: adicionar `referral_code TEXT UNIQUE`, `referred_by UUID NULL REFERENCES clients(id)`, `bonus_days INT DEFAULT 0`
- `settings`: adicionar `referral_reward_days INT DEFAULT 7`
- Nova tabela `portal_otp_codes` (whatsapp, code_hash, expires_at, used_at)
- Nova tabela `portal_sessions` (id, client_id, token_hash, expires_at, created_at)
- Função `gen_referral_code()` + trigger para preencher em todo cliente novo/existente
- Função `apply_referral_bonus(client_id)` chamada quando renovação é feita por indicado pela 1ª vez
- RLS: tabelas portal_* só acessadas via service role (rotas públicas validam token manualmente)

### Rotas públicas (`src/routes/api/public/portal/`)
- `request-otp.ts` — POST { whatsapp } → gera código, envia via Z-API
- `verify-otp.ts` — POST { whatsapp, code } → retorna session token
- `me.ts` — GET (Bearer token) → dados do cliente + pagamentos + indicações
- `renew-request.ts` — POST { period } → marca solicitação de renovação (notifica dono via WhatsApp)
- Todas validam token consultando `portal_sessions` via `supabaseAdmin`

### Páginas do portal (`src/routes/portal.*`)
- `portal.index.tsx` — tela de login (2 passos: telefone → código)
- `portal.painel.tsx` — dashboard do cliente (plano, vencimento, pagamentos, renovar)
- `portal.indique.tsx` — link de indicação + estatísticas
- Layout próprio simples (sem sidebar do painel admin), mobile-first

### Painel admin (ajustes)
- `clientes.tsx`: mostrar coluna "Indicado por" + badge de dias bônus
- `configuracoes.tsx`: campo "Dias grátis por indicação paga" + ativar/desativar
- Aviso WhatsApp opcional ao dono quando cliente solicita renovação pelo portal

## Detalhes técnicos

- **OTP**: código de 6 dígitos, válido 10 minutos, hash com bcrypt antes de salvar, máx. 5 tentativas
- **Sessão**: token aleatório de 32 bytes, hash SHA-256 no banco, expira em 30 dias, renovação a cada `me()`
- **Comprovante**: gerado no navegador com jsPDF (sem custo de servidor)
- **Indicação**: trigger no insert/update de `payments` verifica se é a 1ª paga do cliente E `referred_by` está setado → soma `referral_reward_days` em `bonus_days` do indicador e estende `due_date` em N dias
- **Z-API**: usa a integração já existente para enviar OTP

## Fora do escopo (próximas iterações)

- Pix automático com baixa via webhook (Mercado Pago/Asaas)
- App PWA instalável
- Notificações push
- Recompensa por níveis (10 indicações = 30 dias)

## Pergunta antes de começar

1. **Domínio do portal**: usar `/portal` no mesmo domínio do painel admin (mais simples) ou subdomínio separado depois?
2. **Bônus padrão**: 7 dias por indicação paga te atende? Posso deixar editável em Configurações de qualquer forma.
3. **Renovação no portal**: por enquanto só "solicitar renovação" (você confirma o pagamento no painel) ou já implementar **Pix manual** (gera QR Code estático que você configura uma vez em Configurações)?

Confirma os 3 pontos acima que eu começo a implementação.
