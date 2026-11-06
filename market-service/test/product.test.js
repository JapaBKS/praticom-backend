import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProductUpdate, applyStockChange, createProduct, toProductView } from '../src/domain/Product.js';
import { buildSale, parseBuyer, resolvePaymentMethod, toCondoBillEvent } from '../src/domain/Sale.js';
import { DomainError } from '../src/domain/errors.js';

test('createProduct valida nome e preço', () => {
  assert.throws(() => createProduct({ price: 5 }), DomainError);
  assert.throws(() => createProduct({ name: 'Água', price: -1 }), /Preço de venda inválido/);
  assert.throws(() => createProduct({ name: 'Água', price: 'abc' }), /Preço de venda inválido/);
  assert.throws(() => createProduct({ name: 'Água', price: 5, stock_quantity: -2 }), /estoque inválida/);
});

test('createProduct aplica padrões (estoque mínimo, categoria e código de barras)', () => {
  const product = createProduct({ name: '  Água  ', sale_price: '4.5' });
  assert.equal(product.name, 'Água');
  assert.equal(product.price, 4.5);
  assert.equal(product.min_stock, 5);
  assert.equal(product.stock_quantity, 0);
  assert.equal(product.category, 'Alimentos');
  assert.ok(product.barcode);
});

test('toProductView calcula custo padrão, ícone da categoria e sale_price', () => {
  const view = toProductView({ id: 1, name: 'Água', category: 'Bebidas', price: 10, cost_price: null, min_stock: null, image_url: null });
  assert.equal(view.sale_price, 10);
  assert.equal(view.cost_price, 6.5);
  assert.equal(view.min_stock, 5);
  assert.equal(view.image_url, '🥤');
});

test('applyProductUpdate mantém campos não enviados e rejeita valores inválidos', () => {
  const current = { id: 1, name: 'Água', category: 'Bebidas', price: 4, cost_price: 2, stock_quantity: 10, min_stock: 5, image_url: null, barcode: '1' };
  const updated = applyProductUpdate(current, { price: '5' });
  assert.equal(updated.price, 5);
  assert.equal(updated.name, 'Água');
  assert.equal(updated.stock_quantity, 10);
  assert.throws(() => applyProductUpdate(current, { name: '  ' }), /Nome do produto/);
  assert.throws(() => applyProductUpdate(current, { stock_quantity: -1 }), /estoque inválida/);
});

test('applyStockChange: delta, add, set e subtract (sem ficar negativo)', () => {
  assert.equal(applyStockChange(10, { delta: 5 }), 15);
  assert.equal(applyStockChange(10, { delta: -50 }), 0);
  assert.equal(applyStockChange(10, { quantity: 3, action: 'add' }), 13);
  assert.equal(applyStockChange(10, { quantity: 3, action: 'set' }), 3);
  assert.equal(applyStockChange(10, { quantity: 30, action: 'subtract' }), 0);
  assert.throws(() => applyStockChange(10, { quantity: 3, action: 'xyz' }), /Ação de estoque inválida/);
});

test('resolvePaymentMethod aceita pix, cartão e cota condominial', () => {
  assert.equal(resolvePaymentMethod('pix'), 'PIX');
  assert.equal(resolvePaymentMethod('credit_card'), 'CARD');
  assert.equal(resolvePaymentMethod('condo_bill'), 'CONDO_FEE');
  assert.throws(() => resolvePaymentMethod('dinheiro'), /Forma de pagamento inválida/);
});

test('parseBuyer exige unidade e morador', () => {
  assert.deepEqual(parseBuyer('3', '7'), { unitId: 3, residentId: 7 });
  assert.throws(() => parseBuyer(undefined, 7), /unidade/);
  assert.throws(() => parseBuyer(3, undefined), /morador/);
});

test('buildSale calcula o total com os preços recebidos e marca evento pendente só na cota condominial', () => {
  const lines = [
    { product_id: 1, name: 'Água', price: 4.5, quantity: 2 },
    { product_id: 2, name: 'Doce', price: 8.55, quantity: 1 }
  ];
  const pix = buildSale({ unitId: 1, residentId: 1, paymentMethod: 'pix', lines });
  assert.equal(pix.total_amount, 17.55);
  assert.equal(pix.event_status, 'NOT_REQUIRED');

  const condo = buildSale({ unitId: 1, residentId: 1, paymentMethod: 'condo_bill', lines });
  assert.equal(condo.event_status, 'PENDING');
  assert.throws(() => buildSale({ unitId: 1, residentId: 1, paymentMethod: 'pix', lines: [] }), /vazio/);
});

test('toCondoBillEvent monta o contrato da mensagem', () => {
  const event = toCondoBillEvent({ id: 9, unit_id: 2, resident_id: 3, total_amount: 20, created_at: '2026-11-05T10:00:00.000Z' }, 'abc');
  assert.deepEqual(event, {
    eventId: 'abc',
    type: 'market.sale.condo_bill',
    saleId: 9,
    unitId: 2,
    residentId: 3,
    amount: 20,
    occurredAt: '2026-11-05T10:00:00.000Z'
  });
});
