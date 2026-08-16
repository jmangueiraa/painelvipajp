# Plano de Otimização do Agente de IA - Especialista em Instalação IPTV

O objetivo deste plano é transformar o agente de IA em um verdadeiro especialista em instalação de IPTV, melhorando sua base de conhecimento, resiliência e capacidade de resposta, especialmente para o fluxo de instalação solicitado pelo usuário.

## Alterações Propostas

### 1. Refinamento do Contexto de Vendas (Sales Context)
*   Atualizar o `SALES_CONTEXT` em `src/lib/ai-agent.server.ts` para reforçar a identidade de "Especialista Expert em Instalação".
*   Adicionar instruções explícitas sobre como lidar com solicitações de instalação, garantindo que a IA sempre peça o dispositivo antes de prosseguir.
*   Incluir uma nova regra de fallback mais técnica e útil para casos de oscilação, evitando mensagens genéricas de "soluço".

### 2. Expansão da Base de Conhecimento "Hardcoded" (Fallback Inteligente)
*   Melhorar a lógica de interceptação de mensagens em `processAgentMessageLogic` para identificar intenções de "instalação" com maior precisão.
*   Atualizar as respostas de contingência para serem mais informativas e direcionadas ao suporte humano se a IA falhar.

### 3. Ajuste na Interface do Chat (Portal e Landing Page)
*   Sincronizar as mensagens de erro/instabilidade no componente `AIChat.tsx` para refletir o novo tom profissional e experto.

## Detalhes Técnicos

### Backend (`src/lib/ai-agent.server.ts`)
*   **Prompt de Sistema**: Inclusão de diretrizes de "Expertise Técnica" no `SALES_CONTEXT`.
*   **Lógica de Fallback**: Refatoração do bloco `catch` para fornecer passos iniciais de instalação baseados em palavras-chave capturadas, garantindo que o usuário receba valor imediato mesmo sem a resposta da API Gemini.

### Frontend (`src/components/landing-page/AIChat.tsx`)
*   Atualização da mensagem de boas-vindas e das mensagens de erro para manter a autoridade técnica.

## Validação
*   Simulação de conversas via Admin Panel (`/_authenticated/ai-agent`).
*   Teste manual no chat da Landing Page com as frases: "quero instalar", "como instalo na samsung", "ajuda instalação".
