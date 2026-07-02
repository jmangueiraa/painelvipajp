## Módulo de Entregas / Roteirização (estilo Circuit)

Escopo grande. Vou entregar em **3 fases** para você já usar valor cedo, sem esperar tudo pronto.

Antes de começar preciso confirmar alguns pontos — são decisões que mudam bastante o esforço:

### Perguntas rápidas
1. **Google Maps API** — você já tem uma conta Google Cloud com billing ativo e uma API Key? (precisa das APIs: Maps JavaScript, Geocoding, Routes, Route Optimization). Sem isso o mapa e a otimização não funcionam.
2. **Motoristas** — eles vão logar como *usuários novos do sistema* (com role `driver`) ou como *clientes* do portal atual? Vou criar uma role nova `driver` se você não disser o contrário.
3. **Rastreamento em tempo real** — ok usar Supabase Realtime (localização a cada 10s grava no banco e o admin escuta)? É o caminho natural aqui.
4. **App do motorista** — é a mesma PWA do portal do cliente (rota `/motorista`) ou você quer um domínio/PWA separado?

---

### Fase 1 — Núcleo (essa entrega)
- Tabelas: `drivers`, `deliveries`, `routes`, `route_stops`, `delivery_proofs`, `driver_locations`, `delivery_logs` (com RLS + GRANTs)
- Bucket `delivery-proofs` (fotos + assinaturas)
- CRUD de entregas no admin (`/entregas`): cadastro completo (cliente, telefone, endereço, bairro, cidade, CEP, obs, janela, valor, status)
- Mapa admin com marcadores coloridos por status (Google Maps JS)
- Geocodificação automática do endereço no cadastro (server fn → Google Geocoding)
- Botão "Otimizar rota" → Google Routes API `computeRoutes` com `optimizeWaypointOrder`
- Dashboard de entregas (pendentes / em rota / concluídas / % / km e tempo estimados)

### Fase 2 — App do motorista
- Rota `/motorista` (PWA, login separado com role `driver`)
- Lista de paradas + mapa em tempo real
- Botões: Iniciar rota / Próxima parada / Concluir / Não entregue
- Deep-link `https://www.google.com/maps/dir/?api=1&destination=...` para navegação
- Envio de localização a cada 10s (`navigator.geolocation.watchPosition` + insert em `driver_locations`)
- Prova de entrega: foto (câmera), assinatura (canvas), nome do recebedor, timestamp, GPS

### Fase 3 — Tempo real no admin
- Realtime: posição do motorista aparece no mapa admin ao vivo
- Log de ações em `delivery_logs` (mudanças de status, tentativas, falhas)
- Histórico por entrega e por motorista

---

### Detalhes técnicos
- Frontend: rotas TanStack sob `_authenticated/entregas.*` e público `/motorista`
- Google Maps carregado via `<script>` no `__root.tsx` com sua API key em `VITE_GOOGLE_MAPS_API_KEY`
- Server functions: `geocode-address.functions.ts`, `optimize-route.functions.ts` (chamam Google server-side com `GOOGLE_MAPS_SERVER_KEY` — secret)
- Sidebar: novo grupo "Entregas" (Painel, Cadastros, Motoristas, Rotas)
- Mobile-first: cards empilháveis, mapa fullscreen no motorista

---

**Confirma as 4 perguntas acima e eu começo pela Fase 1?** Se quiser cortar/adiar algo (ex.: pular otimização e ficar só com CRUD + mapa), me diz também.
