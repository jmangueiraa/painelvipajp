export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const parseBrlToCents = (input: string): number => {
  const cleaned = input.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
};

export const formatDateBR = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
};

export const formatDateTimeBR = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return formatDateBR(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const addDaysISO = (iso: string, days: number) => {
  const clean = (iso || "").split(/[\sT]/)[0] || todayISO();
  const d = new Date(clean + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const addMonthsISO = (iso: string, months: number) => {
  const clean = (iso || "").split(/[\sT]/)[0] || todayISO();
  const d = new Date(clean + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Se o dia mudou (ex: de 31 para 1 do mês seguinte), volta para o último dia do mês anterior
  if (d.getUTCDate() !== day) {
    d.setUTCDate(0);
  }
  return d.toISOString().slice(0, 10);
};

export const calculateRenewalDueDate = (currentDueDate: string | null | undefined, days: number): string => {
  const today = todayISO();
  const cleanCurrent = (currentDueDate || "").split(/[\sT]/)[0];

  // Se o cliente não tem vencimento ou já está vencido (cleanCurrent < today),
  // a renovação deve começar a contar a partir de HOJE.
  // Se o vencimento for futuro (cleanCurrent >= today), soma ao vencimento atual para não perder dias.
  const base = (!cleanCurrent || cleanCurrent < today) ? today : cleanCurrent;

  let newDue: string;
  if (days === 30 || days === 90 || days === 180 || days === 365) {
    const months = days === 365 ? 12 : Math.max(1, Math.round(days / 30));
    newDue = addMonthsISO(base, months);
  } else {
    newDue = addDaysISO(base, days);
  }

  // Garantia: se por qualquer razão newDue for menor ou igual a hoje, projeta a partir de hoje
  if (newDue <= today) {
    if (days === 30 || days === 90 || days === 180 || days === 365) {
      const months = days === 365 ? 12 : Math.max(1, Math.round(days / 30));
      newDue = addMonthsISO(today, months);
    } else {
      newDue = addDaysISO(today, days);
    }
  }

  return newDue;
};

export const formatPhone = (raw?: string | null): string => {
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }
  d = d.slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) =>
      [a && `(${a}`, a && a.length === 2 ? ") " : "", b, c && `-${c}`].filter(Boolean).join(""),
    );
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
};
