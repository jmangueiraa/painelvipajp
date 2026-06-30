## O que vai ser entregue

### 1. Tela "Produtos da Loja" (admin)
Nova página em **Configurações → Loja** (ou item lateral "Loja - Produtos") com CRUD:
- Nome do produto (ex: ChatGPT Plus)
- Preço de venda
- Custo (quanto você paga ao fornecedor)
- Validade em dias (30 / 90 / 365…)
- Emoji + ativo/inativo

A loja do **Portal do Cliente** passa a ler dessa tabela em vez do array fixo de hoje. Você adiciona/remove/edita produtos sem precisar de código.

Os 7 produtos atuais (ChatGPT, Spotify, YouTube, Smatone, Globo Play, Prime Video, Netflix) já entram automaticamente cadastrados, com **custo = R$ 0** para você preencher depois.

### 2. Tela "Clientes da Loja" (admin)
Novo item no menu lateral. Lista cada compra entregue por:
- Cliente (vinculado ao cadastro IPTV existente)
- Produto
- Data da compra · Vencimento · Status (Ativo / Vence em X dias / Vencido)
- Valor de venda · Custo · Lucro
- Botão **Renovar** (cria nova entrega manual, soma os dias do produto na data atual)
- Botão **Excluir**

Filtros: por status (todos / ativos / vencidos) e busca por nome.

### 3. Entrega automática registra na nova área
Em **Solicitações**, quando você clica em **Entregar** num pedido da loja (status "Pago" do Mercado Pago):
- Cria registro em `clientes_loja` com vencimento = hoje + dias do produto
- Marca a solicitação como entregue
- Pagamento e custo já ficam contabilizados pro dashboard

### 4. Dashboard
Dois novos cards (linha de baixo, ao lado dos KPIs financeiros):
- **Gasto da Loja** (mês atual) — soma de custos de todas as entregas
- **Lucro da Loja** (mês atual) — venda − custo

### Detalhes técnicos

**Banco — novas tabelas:**

```text
store_products(id, user_id, key, label, sale_cents, cost_cents,
               duration_days, emoji, gradient, sort_order, active)
store_purchases(id, user_id, client_id, product_id,
                label, sale_cents, cost_cents,
                purchased_at, due_date, status,
                renewal_request_id)
```

Ambas com RLS escopada por `user_id = auth.uid()`, GRANTs para `authenticated` e `service_role`. Trigger de seed insere os 7 produtos padrão para cada `settings.user_id` existente e para novos cadastros (via `handle_new_user`).

**Endpoint público:** novo `/api/public/portal/store-products.ts` retorna produtos ativos do dono do cliente logado — usa `supabaseAdmin` apenas para ler colunas seguras.

**Portal cliente:** `portal.painel.tsx` substitui o array `storeProducts` por `useQuery` que chama o endpoint acima (com fallback para os produtos atuais caso a tabela esteja vazia).

**Solicitações:** mutação `approve` em `solicitacoes.tsx`, no branch `isExtra && alreadyPaid`, faz lookup em `store_products` pelo label do `renewal_request` para pegar `cost_cents` e `duration_days`, e insere em `store_purchases`.

**Rotas novas:**
- `src/routes/_authenticated/loja.produtos.tsx`
- `src/routes/_authenticated/loja.clientes.tsx`

**Sidebar:** novo grupo "Loja" com dois itens (Produtos, Clientes), abaixo de "Solicitações".

**Dashboard:** dois `KpiCard` adicionais consultando `store_purchases` do mês corrente.

### O que NÃO muda
- Estrutura de `renewal_requests` continua igual (fluxo de pagamento via Mercado Pago intocado)
- Layout do Portal do Cliente (só a fonte dos produtos muda)
- Cadastro de clientes IPTV permanece como está