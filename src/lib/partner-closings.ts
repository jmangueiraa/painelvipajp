export interface ClosingCycle {
  cycleNumber: number;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  paymentDueDate: string; // YYYY-MM-DD
  label: string;
}

/**
 * Retorna os 5 ciclos oficiais de fechamento semanal para um determinado mês e ano.
 * Regras:
 *  - 01 a 07: pagamento dia 08
 *  - 08 a 14: pagamento dia 15
 *  - 15 a 21: pagamento dia 22
 *  - 22 a 28: pagamento dia 29
 *  - 29 ao fim do mês: pagamento dia 01 seguinte
 */
export function getMonthlyClosingCycles(year: number, month: number): ClosingCycle[] {
  // month: 1 a 12
  const pad = (n: number) => String(n).padStart(2, "0");
  const yStr = String(year);
  const mStr = pad(month);

  // Último dia do mês
  const lastDay = new Date(year, month, 0).getDate();

  // Próximo mês para o pagamento do ciclo 5
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear = year + 1;
  }
  const nextYStr = String(nextYear);
  const nextMStr = pad(nextMonth);

  return [
    {
      cycleNumber: 1,
      periodStart: `${yStr}-${mStr}-01`,
      periodEnd: `${yStr}-${mStr}-07`,
      paymentDueDate: `${yStr}-${mStr}-08`,
      label: `Ciclo 1: 01 a 07/${mStr} (Pagamento: 08/${mStr})`,
    },
    {
      cycleNumber: 2,
      periodStart: `${yStr}-${mStr}-08`,
      periodEnd: `${yStr}-${mStr}-14`,
      paymentDueDate: `${yStr}-${mStr}-15`,
      label: `Ciclo 2: 08 a 14/${mStr} (Pagamento: 15/${mStr})`,
    },
    {
      cycleNumber: 3,
      periodStart: `${yStr}-${mStr}-15`,
      periodEnd: `${yStr}-${mStr}-21`,
      paymentDueDate: `${yStr}-${mStr}-22`,
      label: `Ciclo 3: 15 a 21/${mStr} (Pagamento: 22/${mStr})`,
    },
    {
      cycleNumber: 4,
      periodStart: `${yStr}-${mStr}-22`,
      periodEnd: `${yStr}-${mStr}-28`,
      paymentDueDate: `${yStr}-${mStr}-29`,
      label: `Ciclo 4: 22 a 28/${mStr} (Pagamento: 29/${mStr})`,
    },
    {
      cycleNumber: 5,
      periodStart: `${yStr}-${mStr}-29`,
      periodEnd: `${yStr}-${mStr}-${pad(lastDay)}`,
      paymentDueDate: `${nextYStr}-${nextMStr}-01`,
      label: `Ciclo 5: 29 a ${lastDay}/${mStr} (Pagamento: 01/${nextMStr})`,
    },
  ];
}

/**
 * Determina a qual ciclo de fechamento pertence uma data específica.
 */
export function getCycleForDate(date: Date = new Date()): ClosingCycle {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const cycles = getMonthlyClosingCycles(y, m);

  if (d <= 7) return cycles[0];
  if (d <= 14) return cycles[1];
  if (d <= 21) return cycles[2];
  if (d <= 28) return cycles[3];
  return cycles[4];
}
