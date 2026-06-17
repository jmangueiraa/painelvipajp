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

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const addDaysISO = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export const formatPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) =>
      [a && `(${a}`, a && a.length === 2 ? ") " : "", b, c && `-${c}`].filter(Boolean).join(""),
    );
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
};
