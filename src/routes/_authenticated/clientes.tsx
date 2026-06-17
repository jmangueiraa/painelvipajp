import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Painel VIP" }] }),
  component: () => (
    <PagePlaceholder
      title="Clientes"
      description="Cadastre e gerencie todos os seus clientes em um só lugar."
      hint="Em breve: tabela com busca, filtros, cadastro, edição e detalhes."
    />
  ),
});
