import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

type KpiColor = "violet" | "emerald" | "rose" | "cyan" | "amber" | "primary";

const colorVar: Record<KpiColor, string> = {
  violet: "var(--kpi-violet)",
  emerald: "var(--kpi-emerald)",
  rose: "var(--kpi-rose)",
  cyan: "var(--kpi-cyan)",
  amber: "var(--kpi-amber)",
  primary: "var(--primary)",
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
  const style = { "--kpi-color": colorVar[color] } as CSSProperties;
  return (
    <div className="kpi-card p-4 md:p-5" style={style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-widest uppercase text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl md:text-3xl font-bold tabular-nums" style={{ color: colorVar[color] }}>
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div
          className="size-10 shrink-0 rounded-xl grid place-items-center border"
          style={{
            borderColor: `color-mix(in oklab, ${colorVar[color]} 50%, transparent)`,
            background: `color-mix(in oklab, ${colorVar[color]} 12%, transparent)`,
            color: colorVar[color],
          }}
        >
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}
