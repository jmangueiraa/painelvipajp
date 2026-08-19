# Plano de Implementação - Vencimento Fixo

O objetivo é garantir que a renovação de um plano mantenha o dia de vencimento original do cliente, em vez de contar a partir da data do pagamento.

## Alterações

### 1. Backend: Finalização de Renovação (Mercado Pago)
- Arquivo: `src/lib/portal-renewal-finalize.server.ts`
- Modificar a lógica de cálculo de `newDueDate` para lidar com o "dia fixo".
- Se o cliente já tem um vencimento, o novo vencimento será: `data_vencimento_atual + dias_do_plano`.
- Isso garante que se o vencimento é dia 20 e ele pagar dia 19 ou 21, o próximo continuará sendo dia 20 do mês seguinte.

### 2. Frontend Admin: Aprovação Manual de Solicitações
- Arquivo: `src/routes/_authenticated/solicitacoes.tsx`
- Ajustar a lógica da mutation `approve` para seguir a mesma regra: adicionar os dias ao `due_date` atual do cliente, independentemente da data da aprovação.

### 3. Frontend Admin: Renovação Direta na Listagem de Clientes
- Arquivo: `src/routes/_authenticated/clientes.tsx`
- Ajustar a mutation `renew` para garantir consistência com a regra de dia fixo.

## Detalhes Técnicos
- Utilizaremos a lógica: `novo_vencimento = max(hoje, vencimento_atual) + dias` não é o ideal para "dia fixo".
- A lógica correta para "dia fixo" solicitada é: `novo_vencimento = vencimento_atual + dias`.
- Exemplo: Vencimento 20/08. Pagou 19/08 -> 20/09. Pagou 21/08 -> 20/09.
- Caso o cliente esteja muito atrasado (ex: meses), a lógica de adicionar dias ao vencimento antigo pode gerar uma data no passado. Nesses casos, precisaremos de uma trava para garantir que o novo vencimento seja no futuro, mas tentando preservar o dia (ex: 20 do próximo mês disponível).

## Validação
- Testar renovação antecipada (dia 19 para vencimento dia 20).
- Testar renovação no dia (dia 20 para vencimento dia 20).
- Testar renovação atrasada (dia 21 para vencimento dia 20).
