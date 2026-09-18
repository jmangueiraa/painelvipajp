import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  color?: string;
  icon?: ReactNode;
}

export function ActionPillButton({ icon, className, children, color, ...props }: Props) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white active:scale-[0.99] disabled:opacity-50",
        className,
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
