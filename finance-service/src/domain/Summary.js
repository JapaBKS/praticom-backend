import { effectiveStatus } from './Transaction.js';

const round2 = (n) => Math.round(n * 100) / 100;
const sum = (items) => round2(items.reduce((total, t) => total + t.amount, 0));

// Mesmo formato do getSummary() do Praticom. O BFF completa bloco/apartamento e a taxa de inadimplência,
// porque o cadastro de unidades não pertence a este serviço.
export function summarize(transactions, today) {
  const list = transactions.map((t) => ({ ...t, status: effectiveStatus(t, today) }));
  const pick = (type, ...statuses) => list.filter((t) => t.type === type && statuses.includes(t.status));

  const overdueIncome = pick('INCOME', 'OVERDUE');
  const debtByUnit = new Map();
  for (const t of overdueIncome) {
    if (!t.unit_id) continue;
    debtByUnit.set(t.unit_id, round2((debtByUnit.get(t.unit_id) ?? 0) + t.amount));
  }

  const incomePaid = sum(pick('INCOME', 'PAID'));
  const expensePaid = sum(pick('EXPENSE', 'PAID'));
  const currentBalance = round2(incomePaid - expensePaid);
  const incomeOverdue = sum(overdueIncome);

  return {
    income: { paid: incomePaid, pending: sum(pick('INCOME', 'PENDING', 'OVERDUE')), overdue: incomeOverdue },
    expense: { paid: expensePaid, pending: sum(pick('EXPENSE', 'PENDING', 'OVERDUE')), overdue: sum(pick('EXPENSE', 'OVERDUE')) },
    currentBalance,
    total_balance: currentBalance,
    default_amount: incomeOverdue,
    overdue_count: debtByUnit.size,
    delinquencyByUnit: [...debtByUnit.entries()]
      .map(([unit_id, total_debt]) => ({ unit_id, total_debt }))
      .sort((a, b) => b.total_debt - a.total_debt)
  };
}
