# Plano de Implementação - Vencimento Fixo para Planos Multi-meses

O objetivo é garantir que planos trimestrais, semestrais e anuais sigam a mesma lógica de "vencimento fixo", preservando o dia do mês original do cliente.

## Alterações

### 1. Backend: Finalização de Renovação (Mercado Pago)
- Arquivo: `src/lib/portal-renewal-finalize.server.ts`
- A lógica atual já adiciona `renewal.days` ao vencimento atual. 
- Para planos que representam meses inteiros (90, 180, 365 dias), a adição de dias exatos pode causar deriva no dia do mês (ex: meses de 31 dias vs 30 dias).
- Vou refinar a lógica para que, se o plano for de 30, 90, 180 ou 365 dias, a adição seja feita em **meses** (1, 3, 6, 12 meses) em vez de dias corridos, preservando o dia do mês.

### 2. Frontend Admin: Solicitações e Clientes
- Arquivos: `src/routes/_authenticated/solicitacoes.tsx` e `src/routes/_authenticated/clientes.tsx`
- Atualizar a função de utilidade ou a lógica local para tratar planos de múltiplos meses com `setUTCMonth` em vez de apenas adicionar dias, garantindo que o dia 10 continue sendo dia 10.

### 3. Utilitários de Data
- Arquivo: `src/lib/format.ts`
- Adicionar uma função `addMonthsISO(iso, months)` que preserva o dia do mês (lidando com casos como dia 31 em meses curtos).

## Detalhes Técnicos
- Lógica de "Preservar Dia": Se o vencimento é 10/08 e o plano é Trimestral, o novo vencimento deve ser 10/11.
- Se o dia original não existir no mês de destino (ex: 31 de Janeiro + 1 mês), a data deve ser o último dia do mês (28/29 de Fevereiro).

## Validação
- Testar renovação Trimestral: 10/08 -> 10/11.
- Testar renovação Anual: 10/08/2026 -> 10/08/2027.
