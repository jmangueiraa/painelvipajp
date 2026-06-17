import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PillColor = "violet" | "emerald" | "rose" | "cyan" | "amber" | "primary";

const colorVar: Record<PillColor, string> = {
  violet: "var(--kpi-violet)",
  emerald: "var(--kpi-emerald)",
  rose: "var(--kpi-rose)",
  cyan: "var(--kpi-cyan)",
  amber: "var(--kpi-amber)",
  primary: "var(--primary)",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  color?: PillColor;
  icon?: ReactNode;
}

export function ActionPillButton({ color = "primary", icon, className, children, ...props }: Props) {
  const style = { "--pill-color": colorVar[color] } as CSSProperties;
  return (
    <button {...props} className={cn("action-pill", className)} style={style}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
