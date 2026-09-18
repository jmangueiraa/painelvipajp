import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-600",
  {
    variants: {
      variant: {
        default: "border-zinc-700/60 bg-zinc-800/80 text-zinc-200",
        secondary: "border-zinc-800 bg-zinc-900/80 text-zinc-400",
        destructive: "border-rose-500/20 bg-rose-500/10 text-rose-400",
        outline: "border-zinc-700 text-zinc-300",
        success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-400",
        info: "border-sky-500/20 bg-sky-500/10 text-sky-400",
        emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
        amber: "border-amber-500/20 bg-amber-500/10 text-amber-400",
        rose: "border-rose-500/20 bg-rose-500/10 text-rose-400",
        sky: "border-sky-500/20 bg-sky-500/10 text-sky-400",
        neutral: "border-zinc-700/60 bg-zinc-800/60 text-zinc-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
