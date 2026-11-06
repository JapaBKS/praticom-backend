import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/adapters/inbound/http/createApp.js';
import { InMemoryTransactionRepository } from '../src/adapters/outbound/memory/InMemoryTransactionRepository.js';
import { TransactionService } from '../src/application/TransactionService.js';

const logger = { error() {}, warn() {}, log() {} };
const NOW = new Date('2026-11-05T15:00:00Z');
const body = { type: 'income', category: 'Taxa condominial', description: 'Taxa de novembro', amount: 450, due_date: '2026-11-10', unit_id: 2 };

async function startServer({ internalApiKey = '', acceptHttpEvents = false } = {}) {
  const transactionService = new TransactionService({
    transactionRepository: new InMemoryTransactionRepository(),
    clock: () => NOW,
    logger
  });
  const app = createApp({ transactionService, internalApiKey, acceptHttpEvents, logger });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, payload, headers = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: payload === undefined ? undefined : JSON.stringify(payload)
    });
    return { status: response.status, body: await response.json() };
  };
  return { call, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('CRUD completo de lançamentos', async () => {
  const api = await startServer();
  try {
    const created = await api.call('POST', '/transactions', body);
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'PENDING');
    const id = created.body.id;

    assert.equal((await api.call('GET', '/transactions')).body.length, 1);
    assert.equal((await api.call('GET', `/transactions/${id}`)).body.description, 'Taxa de novembro');

    const updated = await api.call('PATCH', `/transactions/${id}`, { ...body, amount: 500 });
    assert.equal(updated.body.amount, 500);

    const paid = await api.call('PATCH', `/transactions/${id}/pay`);
    assert.equal(paid.body.status, 'PAID');
    assert.ok(paid.body.payment_date);

    assert.equal((await api.call('PATCH', `/transactions/${id}`, body)).status, 400);
    assert.equal((await api.call('DELETE', `/transactions/${id}`)).status, 400);

    const second = await api.call('POST', '/transactions', { ...body, description: 'Outra' });
    assert.equal((await api.call('DELETE', `/transactions/${second.body.id}`)).status, 200);
    assert.equal((await api.call('GET', `/transactions/${second.body.id}`)).status, 404);
  } finally {
    await api.close();
  }
});

test('filtros por status, tipo e busca; vencido é calculado', async () => {
  const api = await startServer();
  try {
    await api.call('POST', '/transactions', { ...body, description: 'Vencida', due_date: '2026-10-01' });
    await api.call('POST', '/transactions', { ...body, description: 'Futura', due_date: '2026-12-01' });
    await api.call('POST', '/transactions', { ...body, description: 'Conta de luz', type: 'expense', due_date: '2026-12-01' });

    assert.equal((await api.call('GET', '/transactions?status=OVERDUE')).body.length, 1);
    assert.equal((await api.call('GET', '/transactions?type=expense')).body.length, 1);
    assert.equal((await api.call('GET', '/transactions?search=luz')).body[0].description, 'Conta de luz');
  } finally {
    await api.close();
  }
});

test('resumo financeiro', async () => {
  const api = await startServer();
  try {
    await api.call('POST', '/transactions', { ...body, due_date: '2026-10-01' });
    const summary = await api.call('GET', '/summary');
    assert.equal(summary.body.income.overdue, 450);
    assert.deepEqual(summary.body.delinquencyByUnit, [{ unit_id: 2, total_debt: 450 }]);
  } finally {
    await api.close();
  }
});

test('validação devolve 400 e id inexistente devolve 404', async () => {
  const api = await startServer();
  try {
    assert.equal((await api.call('POST', '/transactions', { ...body, amount: -1 })).status, 400);
    assert.equal((await api.call('PATCH', '/transactions/99', body)).status, 404);
    assert.equal((await api.call('PATCH', '/transactions/abc/pay')).status, 404);
  } finally {
    await api.close();
  }
});

test('evento do Mercadinho por HTTP (modo local) cria receita e é idempotente', async () => {
  const api = await startServer({ acceptHttpEvents: true });
  try {
    const event = { eventId: 'e1', type: 'market.sale.condo_bill', saleId: 10, unitId: 3, residentId: 4, amount: 25.5 };
    assert.equal((await api.call('POST', '/internal/events', event)).status, 202);
    assert.equal((await api.call('POST', '/internal/events', event)).status, 202);

    const list = await api.call('GET', '/transactions');
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].category, 'Mercadinho');
    assert.equal(list.body[0].amount, 25.5);
    assert.equal(list.body[0].due_date, '2026-12-05');

    assert.equal((await api.call('POST', '/internal/events', { ...event, type: 'x' })).status, 400);
  } finally {
    await api.close();
  }
});

test('POST /internal/events fica desabilitado quando há Service Bus', async () => {
  const api = await startServer({ acceptHttpEvents: false });
  try {
    const response = await api.call('POST', '/internal/events', { type: 'market.sale.condo_bill', saleId: 1, unitId: 1, amount: 1 });
    assert.equal(response.status, 404);
  } finally {
    await api.close();
  }
});

test('chave interna é obrigatória quando configurada (exceto em /health)', async () => {
  const api = await startServer({ internalApiKey: 'segredo' });
  try {
    assert.equal((await api.call('GET', '/health')).status, 200);
    assert.equal((await api.call('GET', '/transactions')).status, 401);
    assert.equal((await api.call('GET', '/transactions', undefined, { 'x-internal-key': 'segredo' })).status, 200);
  } finally {
    await api.close();
  }
});
