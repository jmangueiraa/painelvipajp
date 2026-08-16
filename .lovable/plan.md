# Plano de Estabilização do Agente de IA

O usuário relatou que, ao solicitar a instalação, o Agente de IA está respondendo com uma mensagem de fallback: *"Puxa, tive um pequeno soluço na conexão! 😅 Mas já estou de volta..."*. Esta mensagem indica que a chamada à API do Google Gemini (via Lovable Gateway) está falhando ou excedendo o tempo limite (45s).

## Objetivos
- Identificar e mitigar a causa da instabilidade na conexão com a IA.
- Melhorar o fallback para que ele forneça informações úteis sobre instalação imediatamente, em vez de apenas pedir para repetir.
- Garantir que o histórico de conversas não cause bloqueios ou atrasos na resposta.

## Alterações Propostas

### Backend (`src/lib/ai-agent.server.ts`)
- **Ajuste de Timeout e Resiliência**: Reduzir levemente o timeout de `Promise.race` para 40s para dar margem à resposta de fallback.
- **Melhoria no Fallback de Instalação**: Se a IA falhar e a mensagem do usuário contiver "instalar", "como", "aparelho" ou nomes de marcas (Samsung, LG, etc.), a resposta de fallback será técnica e útil, orientando sobre o dispositivo em vez de ser genérica.
- **Otimização do Histórico**: Garantir que a falha na persistência do histórico (Supabase) nunca interrompa a entrega da resposta ao usuário.
- **Refinamento do Prompt**: Adicionar instruções no `SALES_CONTEXT` para que a IA priorize respostas rápidas em tópicos de instalação.

### Componente de Chat (`src/components/landing-page/AIChat.tsx`)
- **Feedback Visual**: Garantir que o estado de "Digitando..." seja encerrado corretamente em caso de erro.
- **Tratamento de Erros no Frontend**: Melhorar a mensagem exibida quando a API retorna um erro 500, alinhando com a nova estratégia de fallback útil do backend.

## Verificação Técnica
- Executar scripts de teste (`/tmp/browser/ai-debug/test_ai_install.py`) simulando falhas de rede para validar o novo fallback.
- Verificar logs do servidor para identificar se o `LOVABLE_API_KEY` está presente ou se há erros específicos de cota.

## Detalhes Técnicos
- O erro ocorre no bloco `catch` da função `processAgentMessageLogic`.
- A regra de negócio para Samsung/LG (Smartone) será replicada no fallback estático para garantir consistência mesmo offline.
