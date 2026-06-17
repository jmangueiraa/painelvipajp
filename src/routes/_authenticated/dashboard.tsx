import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Painel VIP" }] }),
  component: () => (
    <PagePlaceholder
      title="Dashboard"
      description="Visão geral do seu negócio: clientes, vencimentos e receita."
      hint="Em breve: cards de indicadores, gráficos e atalhos rápidos."
    />
  ),
});
