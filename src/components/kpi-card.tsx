import type { LucideIcon } from "lucide-react";

type KpiColor = "violet" | "emerald" | "rose" | "cyan" | "amber" | "primary" | "sky" | "neutral";

const iconColorMap: Record<KpiColor, string> = {
  violet: "text-zinc-400",
  emerald: "text-emerald-400",
  rose: "text-rose-400",
  cyan: "text-sky-400",
  amber: "text-amber-400",
  primary: "text-zinc-300",
  sky: "text-sky-400",
  neutral: "text-zinc-400",
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  color = "primary",
  hint,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: KpiColor;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 md:p-5 backdrop-blur-md transition-all hover:border-zinc-700/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-zinc-400">{label}</p>
          <p className="mt-2 text-2xl md:text-3xl font-semibold tabular-nums text-zinc-100">
            {value}
          </p>
          {hint && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
        </div>
        <div className="size-9 shrink-0 rounded-lg grid place-items-center bg-zinc-800/60 border border-zinc-700/50">
          <Icon className={`size-4.5 ${iconColorMap[color] || "text-zinc-300"}`} />
        </div>
      </div>
    </div>
  );
}
