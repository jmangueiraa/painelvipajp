import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RenewalSuccessCard({ onHome, onPlanDetails }: {
  onHome: () => void;
  onPlanDetails: () => void;
}) {
  return (
    <section role="status" aria-live="polite" className="renewal-success-card flex flex-col items-center rounded-2xl bg-invoice-surface px-6 py-8 text-center text-invoice-foreground sm:px-8">
      <svg aria-hidden="true" viewBox="0 0 160 150" className="renewal-success-art mb-5 h-36 w-40 shrink-0 fill-none">
        <g className="text-invoice-success" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="80" cy="73" r="34" strokeWidth="6" />
          <path className="renewal-success-check" d="m64 73 11 11 22-23" strokeWidth="7" strokeLinejoin="round" />
          <circle cx="80" cy="17" r="2.5" fill="currentColor" stroke="none" />
          <circle cx="29" cy="106" r="2" />
          <circle cx="119" cy="120" r="2" />
          <path d="m23 49 4 2m103-22c-8 1 3 7-3 9m11 55c-5-5-8 5-1 5m-89 21 2 3m57-99 2 2M80 130v3" />
          <path d="m19 78 5-3-1 5Z" fill="currentColor" stroke="none" />
        </g>
        <g className="text-invoice-action" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="m44 29 2 4m15-9 2-2m67 37c4-8 6 6 11-1m-105 32c8 3-4 7 1 10m22 24 2 4m45-3 2-4m35-43 2 1" />
          <circle cx="116" cy="43" r="1.5" fill="currentColor" stroke="none" />
        </g>
      </svg>
      <h2 className="text-2xl font-extrabold leading-tight">
        <span className="block">PLANO RENOVADO</span>
        <span className="block text-invoice-success">COM SUCESSO</span>
      </h2>
      <p className="mb-7 mt-3 max-w-72 text-sm leading-relaxed text-invoice-muted">
        Não há necessidade de enviar comprovante. Seu acesso já está liberado!
      </p>
      <Button variant="invoice" className="h-12 w-full rounded-full font-bold" onClick={onHome}>
        <Home aria-hidden="true" /> Ir para o início
      </Button>
      <Button variant="invoiceLink" className="mt-2 h-11 text-xs underline underline-offset-4" onClick={onPlanDetails}>
        Ver detalhes do plano
      </Button>
    </section>
  );
}