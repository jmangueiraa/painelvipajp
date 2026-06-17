import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Painel VIP" }] }),
  component: () => (
    <PagePlaceholder
      title="Financeiro"
      description="Acompanhe cobranças, pagamentos e fluxo de caixa do mês."
      hint="Em breve: lista de cobranças, filtros, totais e exportação CSV."
    />
  ),
});
