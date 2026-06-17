import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Sparkles, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/seja-bem-vindo")({
  head: () => ({
    meta: [
      { title: "Seja Bem-Vindo" },
      { name: "description", content: "Uma página de boas-vindas feita com carinho." },
      { property: "og:title", content: "Seja Bem-Vindo" },
      { property: "og:description", content: "Uma página de boas-vindas feita com carinho." },
    ],
  }),
  component: SejaBemVindo,
});

function SejaBemVindo() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="mx-auto max-w-xl text-center">
        <div className="mb-6 inline-flex items-center justify-center rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <Sparkles className="mr-1.5 h-4 w-4" />
          Olá, visitante
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Seja Bem-Vindo
        </h1>

        <p className="mt-4 text-lg text-muted-foreground">
          É um prazer ter você aqui. Esta página foi criada para receber você
          com um sorriso e muito carinho.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para a Home
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </div>

        <div className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Heart className="h-4 w-4 text-destructive" />
          <span>Feito com carinho</span>
          <Heart className="h-4 w-4 text-destructive" />
        </div>
      </div>
    </div>
  );
}
