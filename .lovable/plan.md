# Plano de Otimização da Landing Page e Agente de IA

O usuário solicitou que a landing page seja "mais leve" (otimizada para performance) e mencionou uma instrução de sistema para agir em pedidos de criação/alteração/correção. Embora a mensagem inclua metadados visuais de substituição de texto ("\u2063"), o pedido central é a otimização de performance ("landpage esta muito pesada deixa mais leve").

## Alterações Propostas

### 1. Otimização de Imagens e Assets (Frontend)
- Substituir imagens externas pesadas do Unsplash por versões com dimensões controladas e compressão via parâmetros de URL.
- Implementar `loading="lazy"` em imagens abaixo da dobra (fold).
- Garantir que o `favicon` e outros assets locais usem formatos modernos.

### 2. Otimização de Animações (Framer Motion)
- Configurar `layout="position"` ou `layoutDependency` para evitar re-calculos desnecessários de layout.
- Garantir que animações complexas (como os "Floating Cards") usem `will-change: transform` ou sejam desabilitadas em dispositivos de baixa performance se necessário.

### 3. Otimização do Agente de IA (Client-side)
- Reduzir o payload do histórico enviado para a API (limitar a mensagens essenciais).
- Melhorar o feedback visual de carregamento para parecer mais instantâneo (otimização de percepção).

### 4. Limpeza de Código e Depuração
- Remover `console.log` de depuração no servidor que podem estar atrasando a resposta (como logs de payloads inteiros).

## Detalhes Técnicos

### Arquivos afetados:
- `src/routes/index.tsx`: Otimização de imagens e lazy loading.
- `src/components/landing-page/AIChat.tsx`: Refinamento do envio de histórico e feedback visual.
- `src/lib/ai-agent.server.ts`: Remoção de logs excessivos (`console.log(JSON.stringify(body))`) para reduzir processamento de string no Worker.

### Exemplo de otimização de imagem:
Mudar:
`https://images.unsplash.com/...`
Para:
`https://images.unsplash.com/...&w=800&q=75&auto=format` (especificando largura e qualidade).
