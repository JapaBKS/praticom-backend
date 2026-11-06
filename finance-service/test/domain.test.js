import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  applyTransactionUpdate,
  assertDeletable,
  createTransaction,
  effectiveStatus,
  fromMarketSaleEvent,
  markPaid
} from '../src/domain/Transaction.js';
import { summarize } from '../src/domain/Summary.js';
import { DomainError } from '../src/domain/errors.js';

const base = { type: 'income', category: 'Taxa condominial', description: 'Taxa de novembro', amount: 450, due_date: '2026-11-10' };

test('createTransaction normaliza tipo e valida campos obrigatórios', () => {
  const tx = createTransaction({ ...base, unit_id: '3' });
  assert.equal(tx.type, 'INCOME');
  assert.equal(tx.status, 'PENDING');
  assert.equal(tx.unit_id, 3);
  assert.equal(tx.paid_at, null);

  assert.throws(() => createTransaction({ ...base, type: 'x' }), /Tipo de lançamento inválido/);
  assert.throws(() => createTransaction({ ...base, amount: 0 }), /maior que zero/);
  assert.throws(() => createTransaction({ ...base, amount: 'abc' }), /maior que zero/);
  assert.throws(() => createTransaction({ ...base, description: '  ' }), /Descrição/);
  assert.throws(() => createTransaction({ ...base, category: '' }), /Categoria/);
  assert.throws(() => createTransaction({ ...base, due_date: '10/11/2026' }), /Data de vencimento/);
  assert.throws(() => createTransaction({ ...base, status: 'OVERDUE' }), DomainError);
});

test('lançamento criado como PAID já nasce com data de pagamento', () => {
  const tx = createTransaction({ ...base, status: 'paid' }, new Date('2026-11-05T12:00:00Z'));
  assert.equal(tx.status, 'PAID');
  assert.equal(tx.paid_at, '2026-11-05T12:00:00.000Z');
});

test('status vencido é derivado: pendente com vencimento anterior a hoje', () => {
  const pending = { status: 'PENDING', due_date: '2026-11-01' };
  assert.equal(effectiveStatus(pending, '2026-11-05'), 'OVERDUE');
  assert.equal(effectiveStatus(pending, '2026-11-01'), 'PENDING');
  assert.equal(effectiveStatus({ status: 'PAID', due_date: '2026-01-01' }, '2026-11-05'), 'PAID');
});

test('lançamento pago não pode ser editado, excluído nem pago de novo', () => {
  const paid = { ...createTransaction(base), id: 1, status: 'PAID', paid_at: '2026-11-05T00:00:00.000Z' };
  assert.throws(() => applyTransactionUpdate(paid, base), /pagos não podem ser editados/);
  assert.throws(() => assertDeletable(paid), /pagos não podem ser excluídos/);
  assert.throws(() => markPaid(paid), /já está pago/);
});

test('applyTransactionUpdate mantém a unidade quando ela não é enviada', () => {
  const current = { ...createTransaction({ ...base, unit_id: 4 }), id: 1 };
  const updated = applyTransactionUpdate(current, { ...base, amount: 500 });
  assert.equal(updated.amount, 500);
  assert.equal(updated.unit_id, 4);
});

test('addDays soma dias sem depender de fuso', () => {
  assert.equal(addDays('2026-11-05', 30), '2026-12-05');
  assert.equal(addDays('2026-12-20', 30), '2027-01-19');
});

test('evento do Mercadinho vira receita pendente com vencimento em 30 dias', () => {
  const tx = fromMarketSaleEvent(
    { type: 'market.sale.condo_bill', saleId: 7, unitId: 2, residentId: 3, amount: 19.9 },
    '2026-11-05'
  );
  assert.equal(tx.type, 'INCOME');
  assert.equal(tx.category, 'Mercadinho');
  assert.equal(tx.status, 'PENDING');
  assert.equal(tx.due_date, '2026-12-05');
  assert.equal(tx.unit_id, 2);
  assert.equal(tx.source_ref, 'market-sale-7');
  assert.throws(() => fromMarketSaleEvent({ type: 'outro', amount: 1 }, '2026-11-05'), /não suportado/);
});

test('summarize separa pago, pendente e vencido e calcula inadimplência por unidade', () => {
  const tx = (over) => ({ ...createTransaction({ ...base, ...over }), id: Math.random() });
  const list = [
    tx({ amount: 100, status: 'PAID' }),
    tx({ amount: 50, due_date: '2026-12-01' }),
    tx({ amount: 80, due_date: '2026-10-01', unit_id: 5 }),
    tx({ amount: 20, due_date: '2026-10-02', unit_id: 5 }),
    tx({ amount: 30, type: 'EXPENSE', status: 'PAID' }),
    tx({ amount: 40, type: 'EXPENSE', due_date: '2026-12-01' })
  ];
  const s = summarize(list, '2026-11-05');
  assert.deepEqual(s.income, { paid: 100, pending: 150, overdue: 100 });
  assert.deepEqual(s.expense, { paid: 30, pending: 40, overdue: 0 });
  assert.equal(s.currentBalance, 70);
  assert.equal(s.overdue_count, 1);
  assert.deepEqual(s.delinquencyByUnit, [{ unit_id: 5, total_debt: 100 }]);
});
