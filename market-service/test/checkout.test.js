import test from 'node:test';
import assert from 'node:assert/strict';
import { CheckoutService } from '../src/application/CheckoutService.js';
import { ProductService } from '../src/application/ProductService.js';
import { InMemoryProductRepository, InMemorySaleRepository } from '../src/adapters/outbound/memory/InMemoryRepositories.js';
import { DomainError, NotFoundError } from '../src/domain/errors.js';

async function setup({ failPublish = false } = {}) {
  const productRepository = new InMemoryProductRepository();
  const saleRepository = new InMemorySaleRepository();
  const events = [];
  const eventPublisher = {
    async publish(event) {
      if (failPublish) throw new Error('broker fora do ar');
      events.push(event);
    }
  };
  const silentLogger = { error() {}, warn() {}, log() {} };
  const products = new ProductService({ productRepository });
  const checkout = new CheckoutService({ productRepository, saleRepository, eventPublisher, logger: silentLogger });
  const water = await products.create({ name: 'Água', category: 'Bebidas', price: 4.5, stock_quantity: 10 });
  const candy = await products.create({ name: 'Doce', category: 'Doces', price: 8, stock_quantity: 2 });
  return { products, checkout, events, productRepository, saleRepository, water, candy };
}

const buyer = { unit_id: 1, resident_id: 1 };

test('checkout baixa o estoque e usa o preço do banco', async () => {
  const { checkout, products, water } = await setup();
  const sale = await checkout.checkout({ ...buyer, payment_method: 'pix', items: [{ product_id: water.id, quantity: 3 }] });
  assert.equal(sale.total_amount, 13.5);
  assert.equal(sale.payment_method, 'PIX');
  assert.equal(sale.event_status, 'NOT_REQUIRED');
  assert.equal((await products.get(water.id)).stock_quantity, 7);
});

test('estoque insuficiente falha e devolve o que já tinha sido baixado', async () => {
  const { checkout, products, water, candy } = await setup();
  await assert.rejects(
    checkout.checkout({
      ...buyer,
      payment_method: 'pix',
      items: [{ product_id: water.id, quantity: 4 }, { product_id: candy.id, quantity: 5 }]
    }),
    /Estoque insuficiente para o produto 'Doce'. Disponível: 2, solicitado: 5/
  );
  assert.equal((await products.get(water.id)).stock_quantity, 10);
  assert.equal((await products.get(candy.id)).stock_quantity, 2);
});

test('valida carrinho vazio, produto inexistente, quantidade e pagamento', async () => {
  const { checkout, water } = await setup();
  await assert.rejects(checkout.checkout({ ...buyer, payment_method: 'pix', items: [] }), /vazio/);
  await assert.rejects(checkout.checkout({ ...buyer, payment_method: 'pix', items: [{ product_id: 999, quantity: 1 }] }), NotFoundError);
  await assert.rejects(checkout.checkout({ ...buyer, payment_method: 'pix', items: [{ product_id: water.id, quantity: 0 }] }), /Quantidade inválida/);
  await assert.rejects(checkout.checkout({ ...buyer, payment_method: 'boleto', items: [{ product_id: water.id, quantity: 1 }] }), DomainError);
});

test('débito na cota condominial publica evento para o Financeiro', async () => {
  const { checkout, events, saleRepository, water } = await setup();
  const sale = await checkout.checkout({ ...buyer, payment_method: 'condo_bill', items: [{ product_id: water.id, quantity: 2 }] });
  assert.equal(sale.event_status, 'SENT');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'market.sale.condo_bill');
  assert.equal(events[0].saleId, sale.id);
  assert.equal(events[0].amount, 9);
  assert.equal((await saleRepository.findAll())[0].event_status, 'SENT');
});

test('pagamento por Pix não publica evento', async () => {
  const { checkout, events, water } = await setup();
  await checkout.checkout({ ...buyer, payment_method: 'pix', items: [{ product_id: water.id, quantity: 1 }] });
  assert.equal(events.length, 0);
});

test('se o broker falhar a venda continua válida com evento PENDING', async () => {
  const { checkout, products, saleRepository, water } = await setup({ failPublish: true });
  const sale = await checkout.checkout({ ...buyer, payment_method: 'condo_bill', items: [{ product_id: water.id, quantity: 1 }] });
  assert.equal(sale.event_status, 'PENDING');
  assert.equal((await saleRepository.findAll())[0].event_status, 'PENDING');
  assert.equal((await products.get(water.id)).stock_quantity, 9);
});

test('listSales devolve as vendas mais recentes primeiro', async () => {
  const { checkout, water } = await setup();
  await checkout.checkout({ ...buyer, payment_method: 'pix', items: [{ product_id: water.id, quantity: 1 }] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await checkout.checkout({ ...buyer, payment_method: 'pix', items: [{ product_id: water.id, quantity: 2 }] });
  const sales = await checkout.listSales();
  assert.equal(sales[0].id, second.id);
});
