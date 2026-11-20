# Integração com Servidor IPTV / P2P (API Centralizada)

## 1. Visão Geral
Foi adicionado ao **Painel ADM** (seção **API e Integrações**) o card **"Servidor IPTV / P2P (API)"**, permitindo cadastrar e gerenciar:
- **Nome do Servidor:** Ex: `RBOYS`
- **URL Base da API:** Ex: `https://cms.rboys02.click/api`
- **Chave API (X-API-Key):** Token de autenticação seguro (com suporte ao toggle de visualização/ocultação global de senhas)

## 2. Teste de Conexão em Tempo Real
Ao clicar em **"Testar Conexão"**:
1. O backend realiza uma requisição `GET {base_url}/me` (ou `GET {base_url}/v1/me`, conforme o endpoint oficial `https://cms.rboys02.click/api/v1/me`) com timeout de 10 segundos.
2. Envia o header `X-API-Key` (e `Authorization: Bearer`).
3. Quando a conexão é bem-sucedida, extrai e exibe na hora os dados da conta retornados pelo servidor:
   - **Saldo / Créditos disponíveis** (ex: `50 créditos` ou `R$ 150,00`)
   - **Conta / Usuário** (nome e username)
   - **Clientes Ativos**
   - **E-mail** cadastrado no servidor
   - Status HTTP e tempo de resposta em milissegundos (latência).

## 3. Arquitetura Centralizada (Single Source of Truth)
Conforme solicitado, **nenhuma chave ou URL fica fixa (hardcoded) no código**:
- Backend Node / TanStack Start: `src/lib/iptv-server-api.server.ts`
  - Função `getIptvServerConfig(userId?)`: busca na tabela `iptv_server_integrations` (com fallback para `settings` e variáveis de ambiente).
  - Função `callIptvServerApi(endpoint, options)`: executa qualquer chamada de API utilizando automaticamente as credenciais salvas no banco.
- Supabase Edge Functions: `docs/iptv-server-api.ts`
  - Fornece o mesmo padrão para Edge Functions no Deno.

## 4. Tabela no Banco de Dados
Arquivo de migração:
- `supabase/migrations/20261120_iptv_server_integrations.sql`
- Script manual: `docs/iptv-server-setup.sql`

Estrutura da tabela `iptv_server_integrations`:
- `user_id` (UUID, Primary Key)
- `server_name` (Text)
- `base_url` (Text)
- `api_key` (Text)
- `created_at` / `updated_at` (Timestamptz)
- RLS habilitado com permissão restrita ao dono da conta (`auth.uid() = user_id`) e acesso total para o `service_role`.
