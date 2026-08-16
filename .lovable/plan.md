# Plano de Melhoria da Resiliência do Agente de IA

O usuário relatou que o agente de IA "ainda está com dificuldade em responder". Embora os testes básicos tenham passado usando o modelo `gemini-2.0-flash-exp` e o sistema de fallback, o problema pode estar relacionado ao tempo de resposta da API (latência), limites de cota no gateway ou falhas silenciosas na persistência do histórico que interrompem o fluxo.

## Objetivos
- Reduzir o tempo de resposta percebido pelo usuário.
- Garantir que a IA sempre responda, mesmo com alta latência.
- Melhorar a detecção de intenção para respostas rápidas de hardware.
- Estabilizar a persistência do histórico de conversas no banco de dados.

## Ações Propostas

### 1. Refinamento do Modelo e Timeout
- Validar se o modelo `google/gemini-2.0-flash-exp` é o mais estável para o gateway ou se devemos usar `google/gemini-1.5-flash` para menor latência.
- Ajustar o timeout do `Promise.race` para 35 segundos (atualmente 40s) para acionar o fallback mais rápido antes que o usuário desista.

### 2. Otimização do Sistema de Fallback (Back-end)
- Expandir o dicionário de palavras-chave no `catch` do `src/lib/ai-agent.server.ts`.
- Adicionar tratamento específico para "Smartone", "MAC", "Device Key" e "Lista".
- Garantir que o fallback não pareça um erro, mas sim uma "ajuda rápida de hardware".

### 3. Melhoria na UI de Chat (Front-end)
- Aumentar o timeout de requisição no `AIChat.tsx` para coincidir com o servidor.
- Adicionar uma mensagem de "Ainda estou processando sua configuração..." caso a resposta demore mais de 10 segundos.

### 4. Estabilização da Persistência
- Simplificar o `upsert` no `ai-agent.server.ts` para evitar race conditions.
- Adicionar logs mais detalhados para capturar erros específicos do gateway Lovable.

## Detalhes Técnicos

### Arquivos afetados:
- `src/lib/ai-agent.server.ts`: Ajuste de modelo, timeouts e lógica de fallback.
- `src/components/landing-page/AIChat.tsx`: Sincronização de timeouts e feedbacks visuais.

### Estratégia de Fallback Expandida:
```typescript
const hardwareKeywords = {
  samsung: "Para Samsung, use o SmartOne. Tutorial: ...",
  lg: "Para LG, use o SmartOne. Tutorial: ...",
  roku: "Para Roku, recomendo o MetaX ou IBO Player. Tutorial: ...",
  firestick: "Para Fire Stick, baixe o Downloader primeiro. Tutorial: ..."
};
```
