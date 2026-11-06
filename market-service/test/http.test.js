import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/adapters/inbound/http/createApp.js';
import { CheckoutService } from '../src/application/CheckoutService.js';
import { ProductService } from '../src/application/ProductService.js';
import { InMemoryProductRepository, InMemorySaleRepository } from '../src/adapters/outbound/memory/InMemoryRepositories.js';

async function startServer({ internalApiKey = '' } = {}) {
  const productRepository = new InMemoryProductRepository();
  const saleRepository = new InMemorySaleRepository();
  const events = [];
  const eventPublisher = { async publish(event) { events.push(event); } };
  const logger = { error() {}, warn() {}, log() {} };
  const app = createApp({
    productService: new ProductService({ productRepository }),
    checkoutService: new CheckoutService({ productRepository, saleRepository, eventPublisher, logger }),
    internalApiKey,
    logger
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  return { call, events, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('CRUD completo de produtos', async () => {
  const api = await startServer();
  try {
    const created = await api.call('POST', '/products', { name: 'Água', category: 'Bebidas', price: 4.5, stock_quantity: 10 });
    assert.equal(created.status, 201);
    const id = created.body.id;

    const list = await api.call('GET', '/products');
    assert.equal(list.body.length, 1);

    const one = await api.call('GET', `/products/${id}`);
    assert.equal(one.body.name, 'Água');

    const updated = await api.call('PATCH', `/products/${id}`, { price: 5 });
    assert.equal(updated.body.price, 5);

    const stock = await api.call('PATCH', `/products/${id}/stock`, { delta: -4 });
    assert.equal(stock.body.stock_quantity, 6);

    const removed = await api.call('DELETE', `/products/${id}`);
    assert.equal(removed.status, 200);
    assert.equal((await api.call('GET', `/products/${id}`)).status, 404);
  } finally {
    await api.close();
  }
});

test('erros de domínio viram 400 e produto inexistente vira 404', async () => {
  const api = await startServer();
  try {
    assert.equal((await api.call('POST', '/products', { name: 'Sem preço' })).status, 400);
    assert.equal((await api.call('PATCH', '/products/999', { price: 1 })).status, 404);
    assert.equal((await api.call('POST', '/checkout', { items: [] })).status, 400);
  } finally {
    await api.close();
  }
});

test('checkout com cota condominial gera venda e evento', async () => {
  const api = await startServer();
  try {
    const { body: product } = await api.call('POST', '/products', { name: 'Água', price: 4.5, stock_quantity: 10 });
    const sale = await api.call('POST', '/checkout', {
      unit_id: 1,
      resident_id: 2,
      payment_method: 'condo_bill',
      items: [{ product_id: product.id, quantity: 2 }]
    });
    assert.equal(sale.status, 201);
    assert.equal(sale.body.total_amount, 9);
    assert.equal(api.events.length, 1);

    const sales = await api.call('GET', '/sales');
    assert.equal(sales.body.length, 1);
    assert.equal((await api.call('GET', `/products/${product.id}`)).body.stock_quantity, 8);
  } finally {
    await api.close();
  }
});

test('chave interna é obrigatória quando configurada (exceto em /health)', async () => {
  const api = await startServer({ internalApiKey: 'segredo' });
  try {
    assert.equal((await api.call('GET', '/health')).status, 200);
    assert.equal((await api.call('GET', '/products')).status, 401);
    assert.equal((await api.call('GET', '/products', undefined, { 'x-internal-key': 'errada' })).status, 401);
    assert.equal((await api.call('GET', '/products', undefined, { 'x-internal-key': 'segredo' })).status, 200);
  } finally {
    await api.close();
  }
});
