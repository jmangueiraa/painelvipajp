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

/**
 * Adiciona meses a uma data mantendo estritamente o dia fixo do vencimento.
 * Ex: 20/09 + 1 mês = 20/10. Se o dia fixo for 31 e o mês tiver 30 dias (ex: Setembro),
 * ajusta para 30. No mês seguinte (Outubro) com 31 dias, volta a usar 31.
 */
export const addMonthsWithFixedDay = (
  iso: string,
  months: number,
  targetFixedDay?: number
): string => {
  const clean = (iso || "").split(/[\sT]/)[0] || todayISO();
  const [yearStr, monthStr, dayStr] = clean.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1 a 12
  const currentDay = parseInt(dayStr, 10);
  const fixedDay = targetFixedDay || currentDay;

  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  // Último dia do mês alvo (dia 0 do mês seguinte)
  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const finalDay = Math.min(fixedDay, daysInTargetMonth);

  const mm = String(targetMonth).padStart(2, "0");
  const dd = String(finalDay).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
};

export const addMonthsISO = (iso: string, months: number, targetFixedDay?: number) => {
  return addMonthsWithFixedDay(iso, months, targetFixedDay);
};

/**
 * Calcula a data de renovação mantendo a DATA FIXA DE VENCIMENTO.
 * Regras:
 * - Se o plano vence dia 20/09/2026 e o cliente pagar dia 18/09/2026 (antecipado):
 *   O próximo vencimento será 20/10/2026.
 * - Se o plano vence dia 20/09/2026 e o cliente pagar dia 20/09/2026 (no dia):
 *   O próximo vencimento será 20/10/2026.
 * - Se o plano vence dia 20/09/2026 e o cliente pagar dia 21/09/2026 (atrasado):
 *   O próximo vencimento será 20/10/2026.
 */
export const calculateRenewalDueDate = (
  currentDueDate: string | null | undefined,
  days: number,
  overrideFixedDay?: number
): string => {
  const today = todayISO();
  const cleanCurrent = (currentDueDate || "").split(/[\sT]/)[0];

  // Caso 1: Cliente novo sem vencimento anterior cadastrado
  if (!cleanCurrent) {
    if (
      days === 30 ||
      days === 60 ||
      days === 90 ||
      days === 180 ||
      days === 365 ||
      (days >= 28 && days <= 31)
    ) {
      const months = days === 365 ? 12 : Math.max(1, Math.round(days / 30));
      return addMonthsWithFixedDay(today, months, overrideFixedDay);
    }
    return addDaysISO(today, days);
  }

  // Descobre o dia fixo original (ex: dia 20 de '2026-09-20')
  const originalDay = parseInt(cleanCurrent.split("-")[2], 10) || 1;
  const fixedDay = overrideFixedDay || originalDay;

  const isMonthBased =
    days === 30 ||
    days === 60 ||
    days === 90 ||
    days === 180 ||
    days === 365 ||
    (days >= 28 && days <= 31);
  const months = days === 365 ? 12 : isMonthBased ? Math.max(1, Math.round(days / 30)) : 0;

  if (isMonthBased) {
    if (cleanCurrent >= today) {
      // Cliente em dia ou antecipado (ex: vence 20/09 e pagou 18/09 ou 20/09):
      // Acrescenta os meses mantendo estritamente o dia fixo -> 20/10/2026
      return addMonthsWithFixedDay(cleanCurrent, months, fixedDay);
    } else {
      // Cliente em atraso (ex: vencia 20/09 e pagou 21/09):
      // Calcula o ciclo a partir do vencimento original:
      let candidate = addMonthsWithFixedDay(cleanCurrent, months, fixedDay);

      // Se o candidato já é uma data futura (> today), mantém exatamente essa data!
      // Ex: 20/09 + 1 mês = 20/10/2026 (> 21/09/2026). Retorna 20/10/2026.
      if (candidate > today) {
        return candidate;
      }

      // Se o atraso foi de mais de 1 ciclo (candidate <= today),
      // avança mês a mês mantendo o dia fixo até ultrapassar hoje:
      while (candidate <= today) {
        candidate = addMonthsWithFixedDay(candidate, 1, fixedDay);
      }

      // Para planos de múltiplos meses (ex: trimestral), adiciona os meses restantes:
      if (months > 1) {
        candidate = addMonthsWithFixedDay(candidate, months - 1, fixedDay);
      }

      return candidate;
    }
  } else {
    // Plano em dias corridos avulsos (ex: teste de 7 dias)
    const base = cleanCurrent >= today ? cleanCurrent : today;
    return addDaysISO(base, days);
  }
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
