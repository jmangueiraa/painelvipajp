import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/indica/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/indica/$tab", params: { tab: "visao-geral" } });
  },
});
