import type { ReactNode } from "react";

export function PriorityPaymentGate({ visible, children }: { visible: boolean; children: ReactNode }) {
  if (!visible) return null;
  return <>{children}</>;
}