import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between pb-1">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-100">{title}</h1>
        {description && <p className="text-sm text-zinc-400 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 justify-end">{actions}</div>}
    </header>
  );
}
