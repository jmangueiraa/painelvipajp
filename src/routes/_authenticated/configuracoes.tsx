import { createFileRoute } from "@tanstack/react-router";
import { PagePlaceholder } from "@/components/page-placeholder";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Painel VIP" }] }),
  component: () => (
    <PagePlaceholder
      title="Configurações"
      description="Dados da empresa, chave Pix e preferências de cobrança."
      hint="Em breve: empresa, chave Pix e mensagem padrão de cobrança."
    />
  ),
});
