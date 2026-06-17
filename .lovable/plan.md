## Visão geral

Aplicar o visual e a estrutura das imagens de referência ao app, mantendo todo o backend já criado (clientes, planos, charges, payments, settings). Não copiarei marca, código ou textos proprietários — apenas a arquitetura visual: dark premium, cards com bordas neon coloridas, headers compactos, ações em pílulas com gradiente.

## 1. Design system (src/styles.css)

- Reforçar tema escuro como padrão (background ~ `oklch(0.14 0.03 260)`, surface levemente mais clara, borders sutis).
- Adicionar tokens semânticos de status com glow:
  - `--kpi-violet`, `--kpi-emerald`, `--kpi-rose`, `--kpi-cyan`, `--kpi-amber` (cor + cor-foreground + cor-glow).
- Gradiente primário azul→ciano para botões de ação principal (`btn-premium`).
- Utilities `@utility kpi-card` e `@utility action-pill` para cards com borda colorida e leve glow externo.

## 2. Navegação (sidebar)

Itens finais, na ordem das referências:
1. Dashboard
2. Clientes
3. Planos
4. Servidores  *(novo)*
5. Financeiro
6. Renovação  *(novo)*
7. Configurações

## 3. Páginas — restruturação visual

### Dashboard (`/dashboard`)
- Faixa superior com aviso "Sua assinatura — vence em X" (lê de `settings`/placeholder).
- 5 KPI cards coloridos: Total de clientes, Ativos, Vencidos, Vencem hoje, A vencer no mês.
- Grid: gráfico de Receita (6 meses, recharts) + card "Status dos clientes" (donut).
- Card "Próximos vencimentos" (próximos 7 dias).

### Clientes (`/clientes`)
- Header com título "Clientes" + contagem + fila horizontal de ações em pílulas com gradiente:
  - Cobrar Antecipado (5d), Cobrar Vencidos, Cobrar Vencendo Amanhã, Cobrar vence hoje, **+ Novo cliente**.
- Linha de busca + chips de filtro: Todos / Em dia / A vencer / Vencem hoje / Vencidos / Bloqueados.
- Tabela atual mantida; estado vazio "Cadastrar primeiro cliente".
- **Dialog "Novo cliente"** ganha campos: `Login IPTV`, `Senha IPTV`, `Servidor` (select), `Cobrança Automática` (toggle). WhatsApp e Vencimento permanecem obrigatórios. Telefone mantém máscara.

### Planos (`/planos`)
- Header + linha "Novo plano" inline (Nome / Preço / Duração / + Adicionar).
- Lista em cards (em vez de tabela), com editar/excluir e badge ativo.

### Servidores (`/servidores`) — NOVO
- Header + linha inline "Novo servidor" (Nome / Custo do crédito / + Adicionar).
- Lista em cards. Cliente passa a referenciar `server_id` opcional.

### Financeiro (`/financeiro`)
- 3 KPIs grandes: Lucro do mês, Lucro do ano, Lucro total (gradientes violeta/azul/emerald).
- 2 KPIs: Receitas do mês, Despesas de crédito do mês.
- Gráfico "Recebimentos — 12 meses" (recharts).
- Tabela "Histórico de pagamentos".
- Card final "Clientes no valor do mês".

### Renovação (`/renovacao`) — NOVO
- Card "Status" da revenda (dias restantes, expira em, valor mensal) — vindo de `settings`.
- 4 cards de período: Pix +30 / +90 / +180 / +1 ano com valores.
- Esta é uma vitrine local (sem Pix real ainda); marca como "Em breve" ao clicar.

### Configurações (`/configuracoes`)
- Cards verticais empilhados:
  1. Perfil (email, nome de exibição) — salva em `profiles`.
  2. Conectar WhatsApp (placeholder + campo "Instância Evolution").
  3. Cadastrar PIX (chave, nome, banco, mensagem) — `settings`.
  4. Mensagem padrão de suporte — `settings`.
  5. Alterar senha — supabase auth.

## 4. Banco de dados (1 migração)

```
CREATE TABLE public.servers (id, user_id, name, credit_cost_cents, created_at, updated_at)
ALTER TABLE public.clients ADD COLUMN iptv_login text, iptv_password text, server_id uuid REFERENCES servers, auto_charge boolean DEFAULT true
ALTER TABLE public.settings ADD COLUMN pix_key text, pix_name text, pix_bank text, pix_message text, support_message text, whatsapp_instance text, subscription_expires_at date, subscription_monthly_cents int DEFAULT 0
```
+ RLS por `user_id` em `servers`, GRANTs, trigger updated_at.

## 5. Escopo deste passo

Vou implementar nesta entrega:
- Tokens de design + sidebar nova (Servidores/Renovação).
- Restruturação visual de Dashboard, Clientes, Planos, Financeiro.
- Páginas novas Servidores e Renovação (UI + CRUD/leitura básica).
- Novos campos no dialog de cliente.
- Página Configurações com formulários funcionais (perfil, PIX, mensagens).
- Migração descrita acima.

**Fora deste passo**: envio real de cobrança em massa pelos botões "Cobrar X" (apenas abrem confirmação/toast por enquanto), integração Pix real, geração de QR Code, envio automático via Evolution. Esses entram quando você pedir Fase 4.

Posso seguir?