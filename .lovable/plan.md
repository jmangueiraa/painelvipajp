# Painel VIP — Plano de Construção

SaaS de gestão de clientes recorrentes, planos, cobranças Pix e financeiro. Stack: TanStack Start + React + TypeScript + Tailwind + shadcn/ui + Lovable Cloud (Supabase) para auth, banco e RLS.

Por ser um sistema grande, vou entregar em **5 fases sequenciais**, cada uma deixando o app utilizável. Após cada fase você testa e seguimos.

---

## Fase 1 — Fundação (auth, layout, design system)

- Habilitar Lovable Cloud.
- Design system premium em `src/styles.css`: paleta moderna (azul-índigo profundo + verde para "ativo" + âmbar/vermelho para vencidos), tipografia, sombras suaves, cards arredondados, tokens semânticos (nada de cores hardcoded).
- Auth: tela `/auth` com login, cadastro e recuperação de senha (email/senha + Google opcional depois).
- Tabela `profiles` + trigger de criação automática no signup.
- Layout `_authenticated`: sidebar fixa (Dashboard, Clientes, Planos, Financeiro, Configurações), topbar com nome do usuário e botão sair, responsivo (sidebar vira drawer no mobile).
- Página `/reset-password`.

## Fase 2 — Planos e Clientes

- Tabelas `plans` e `clients` com RLS por `user_id` + grants.
- Página **Planos**: listar, criar, editar, excluir, status ativo/inativo, contagem de clientes vinculados.
- Página **Clientes**: tabela com busca e filtros (ativo/vencido/vence hoje/suspenso/cancelado), modais de criar/editar, exclusão com confirmação, página de detalhes com histórico.
- Ao selecionar plano no cadastro, preenche valor e calcula próximo vencimento.
- Validações com zod (nome, telefone e vencimento obrigatórios).
- Badges de status com cores semânticas.

## Fase 3 — Financeiro e Cobranças

- Tabelas `charges` e `payments` com RLS + grants.
- Página **Financeiro**: lista de cobranças, filtros (período, status), totais (recebido/pendente/vencido no mês), exportação CSV.
- Ações: criar cobrança manual, marcar como paga (gera payment + renova vencimento do cliente conforme duração do plano), cancelar.
- Status automático: cobrança vira "vencida" quando passa da data.

## Fase 4 — Dashboard e Cobrança Pix/WhatsApp

- **Dashboard** com cards (total/ativos/vencidos/vencem hoje/próx 7 dias, receita prevista/recebida/em atraso), gráfico de faturamento mensal (recharts), gráfico de clientes por status, lista de pendentes, atalhos rápidos.
- **Cobrança Pix simulada**: gerador de payload BR Code (EMV) a partir das configs Pix do usuário + QR Code (lib `qrcode`), modal com "copia e cola" + botão copiar + botão enviar WhatsApp (`wa.me` com mensagem template).
- **Ações em massa**: cobrar todos vencidos, cobrar todos que vencem hoje, copiar lista, abrir WhatsApp em sequência.
- Estrutura preparada para integração futura com Mercado Pago/Asaas/Efi (camada `pix-provider` com modo `manual` ativo).

## Fase 5 — Configurações e polimento

- Tabela `settings` (1 linha por usuário): empresa, chave Pix + tipo, recebedor, cidade, mensagem padrão, dias de renovação padrão.
- Página **Configurações**: dados da empresa, Pix, perfil do usuário, mensagem padrão (com placeholders `[nome] [plano] [valor] [data] [pix]`).
- Preparar estrutura para tema escuro (tokens já semânticos).
- Toasts de sucesso/erro em todas as ações, estados vazios, skeletons.
- Seed de exemplo quando o banco está vazio (apenas visual no dashboard, não escreve dados).

---

## Detalhes técnicos

- **Backend**: Lovable Cloud (Supabase). RLS em todas as tabelas filtrando por `auth.uid() = user_id`. Roles em tabela separada `user_roles` (preparado, mesmo que só haja "admin" agora). Grants explícitos para `authenticated` e `service_role`.
- **Server functions** TanStack para operações sensíveis (geração Pix usa apenas dados do próprio usuário via `requireSupabaseAuth`).
- **Pix**: implementação local do BR Code estático (EMV) — não requer integração externa, gera QR válido para pagamento manual. Provedores reais ficam como interface plugável.
- **Rotas**: tudo autenticado sob `_authenticated/` exceto `/auth` e `/reset-password`. `/` redireciona para `/dashboard` se logado, senão para `/auth`.
- **Schema resumido**:
  ```
  profiles(id, full_name, company_name, created_at)
  plans(id, user_id, name, price_cents, duration_days, description, active)
  clients(id, user_id, plan_id, name, phone, email, doc, address,
          price_cents, due_date, status, notes, internal_notes, created_at)
  charges(id, user_id, client_id, amount_cents, due_date, paid_at,
          status, method, notes, created_at)
  payments(id, user_id, client_id, charge_id, amount_cents, paid_at, method)
  settings(user_id PK, pix_key, pix_key_type, pix_receiver, pix_city,
           default_message, default_renewal_days)
  user_roles(id, user_id, role)
  ```

---

## O que NÃO está incluído (pra alinhar expectativa)

- Integração real com gateway Pix (Mercado Pago/Asaas/Efi) — fica como interface preparada; Pix gerado é BR Code estático válido.
- Envio automático de WhatsApp (sem API oficial) — usa `wa.me` que abre o WhatsApp do usuário.
- Multi-tenant com times/sub-usuários — cada conta é isolada (single-user por workspace).
- Tema escuro funcional — tokens preparados, ativação fica para depois.

Posso começar pela **Fase 1** assim que aprovar?
