import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/planos")({
  head: () => ({ meta: [{ title: "Planos — Painel VIP" }] }),
  component: () => (
    <PagePlaceholder
      title="Planos"
      description="Defina os planos mensais oferecidos aos seus clientes."
      hint="Em breve: criação de planos, valores e duração."
    />
  ),
});
