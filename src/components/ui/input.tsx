import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-zinc-100 focus-visible:outline-none focus-visible:border-zinc-600 focus-visible:ring-1 focus-visible:ring-zinc-600 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
