import { DomainError } from './errors.js';

// Regras reaproveitadas do FinancialDAO do Praticom original.

export const TYPES = ['INCOME', 'EXPENSE'];
export const MARKET_SALE_EVENT = 'market.sale.condo_bill';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const round2 = (n) => Math.round(n * 100) / 100;

function parseType(value) {
  const type = String(value ?? '').toUpperCase();
  if (!TYPES.includes(type)) {
    throw new DomainError('Tipo de lançamento inválido.');
  }
  return type;
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DomainError('O valor do lançamento deve ser maior que zero.');
  }
  return round2(amount);
}

function parseRequiredText(value, field) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new DomainError(`${field} é obrigatória.`);
  }
  return text;
}

function parseDueDate(value) {
  const due = String(value ?? '');
  if (!ISO_DATE.test(due) || Number.isNaN(new Date(`${due}T00:00:00Z`).getTime())) {
    throw new DomainError('Data de vencimento inválida (use AAAA-MM-DD).');
  }
  return due;
}

function parseUnitId(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new DomainError('Unidade inválida.');
  }
  return id;
}

export function createTransaction(data = {}, now = new Date()) {
  const status = String(data.status ?? 'PENDING').toUpperCase();
  if (!['PENDING', 'PAID'].includes(status)) {
    throw new DomainError('Status inválido: use PENDING ou PAID.');
  }
  return {
    unit_id: parseUnitId(data.unit_id),
    description: parseRequiredText(data.description, 'Descrição'),
    amount: parseAmount(data.amount),
    type: parseType(data.type),
    category: parseRequiredText(data.category, 'Categoria'),
    status,
    due_date: parseDueDate(data.due_date),
    paid_at: status === 'PAID' ? now.toISOString() : null,
    source_ref: data.source_ref ?? null
  };
}

// Edição mantém a unidade quando ela não é enviada; lançamentos pagos são imutáveis.
export function applyTransactionUpdate(existing, data = {}) {
  if (existing.status === 'PAID') {
    throw new DomainError('Lançamentos pagos não podem ser editados.');
  }
  return {
    ...existing,
    unit_id: data.unit_id === undefined ? existing.unit_id : parseUnitId(data.unit_id),
    description: parseRequiredText(data.description ?? existing.description, 'Descrição'),
    amount: parseAmount(data.amount ?? existing.amount),
    type: parseType(data.type ?? existing.type),
    category: parseRequiredText(data.category ?? existing.category, 'Categoria'),
    due_date: parseDueDate(data.due_date ?? existing.due_date)
  };
}

export function assertDeletable(existing) {
  if (existing.status === 'PAID') {
    throw new DomainError('Lançamentos pagos não podem ser excluídos.');
  }
}

export function markPaid(existing, now = new Date()) {
  if (existing.status === 'PAID') {
    throw new DomainError('Este lançamento já está pago.');
  }
  return { ...existing, status: 'PAID', paid_at: now.toISOString() };
}

// Soma dias a uma data AAAA-MM-DD trabalhando em UTC (sem depender do fuso do servidor).
export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Pendente com vencimento anterior a hoje é exibido como OVERDUE (vencido).
export function effectiveStatus(transaction, today) {
  if (transaction.status === 'PENDING' && transaction.due_date < today) {
    return 'OVERDUE';
  }
  return transaction.status;
}

// Formato esperado pela tela Financeiro do Praticom.
export function toTransactionView(transaction, today) {
  return {
    ...transaction,
    status: effectiveStatus(transaction, today),
    document_number: transaction.id,
    payment_date: transaction.paid_at
  };
}

// Compra no Mercadinho debitada na cota condominial => receita pendente com vencimento em 30 dias.
export function fromMarketSaleEvent(event, today) {
  if (!event || event.type !== MARKET_SALE_EVENT) {
    throw new DomainError(`Tipo de evento não suportado: ${event?.type}`);
  }
  if (!event.saleId) {
    throw new DomainError('Evento inválido: saleId é obrigatório.');
  }
  return createTransaction({
    unit_id: event.unitId,
    description: `Mercadinho Autônomo - Compra PDV #${event.saleId}`,
    amount: event.amount,
    type: 'INCOME',
    category: 'Mercadinho',
    status: 'PENDING',
    due_date: addDays(today, 30),
    source_ref: `market-sale-${event.saleId}`
  });
}
