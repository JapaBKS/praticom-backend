import { DomainError } from './errors.js';

// Regras reaproveitadas do MarketDAO do Praticom original.

// Ícone exibido quando o produto não tem um próprio cadastrado.
export const CATEGORY_ICONS = {
  'Bebidas': '🥤',
  'Snacks & Salgados': '🍿',
  'Doces': '🍫',
  'Congelados': '🧊',
  'Higiene & Limpeza': '🧼',
  'Mercearia': '🛒'
};

export const DEFAULT_MIN_STOCK = 5;

const round2 = (n) => Math.round(n * 100) / 100;

function generateBarcode() {
  return String(Math.floor(7890000000000 + Math.random() * 9999999999));
}

function assertPrice(price) {
  if (Number.isNaN(price) || price < 0) {
    throw new DomainError('Preço de venda inválido.');
  }
  return price;
}

function assertStock(stock) {
  if (Number.isNaN(stock) || stock < 0) {
    throw new DomainError('Quantidade em estoque inválida.');
  }
  return stock;
}

export function createProduct(data = {}) {
  const name = String(data.name ?? '').trim();
  if (!name) {
    throw new DomainError('Nome do produto é obrigatório.');
  }
  const price = assertPrice(parseFloat(data.price ?? data.sale_price));
  const cost = parseFloat(data.cost_price);
  const minStock = parseInt(data.min_stock, 10);
  const stock = assertStock(parseInt(data.stock_quantity || 0, 10));

  return {
    name,
    category: data.category || 'Alimentos',
    price,
    cost_price: Number.isNaN(cost) ? null : cost,
    stock_quantity: stock,
    min_stock: Number.isNaN(minStock) ? DEFAULT_MIN_STOCK : minStock,
    image_url: data.image_url || null,
    barcode: data.barcode || generateBarcode()
  };
}

export function applyProductUpdate(product, data = {}) {
  const name = data.name !== undefined ? String(data.name).trim() : product.name;
  if (!name) {
    throw new DomainError('Nome do produto é obrigatório.');
  }

  const priceInput = data.price ?? data.sale_price;
  const price = assertPrice(
    priceInput !== undefined && priceInput !== '' ? parseFloat(priceInput) : product.price
  );
  const cost = data.cost_price !== undefined && data.cost_price !== ''
    ? parseFloat(data.cost_price)
    : product.cost_price;
  const stock = assertStock(
    data.stock_quantity !== undefined && data.stock_quantity !== ''
      ? parseInt(data.stock_quantity, 10)
      : product.stock_quantity
  );
  const minStock = data.min_stock !== undefined && data.min_stock !== ''
    ? parseInt(data.min_stock, 10)
    : product.min_stock;

  return {
    ...product,
    name,
    category: data.category || product.category,
    price,
    cost_price: Number.isNaN(cost) ? null : cost,
    stock_quantity: stock,
    min_stock: Number.isNaN(minStock) ? DEFAULT_MIN_STOCK : minStock,
    image_url: data.image_url !== undefined ? data.image_url || null : product.image_url,
    barcode: data.barcode !== undefined ? data.barcode || null : product.barcode
  };
}

// Ajuste manual de estoque: "delta" tem prioridade; senão usa quantity + action (add | set | subtract).
export function applyStockChange(current, { delta, quantity, action } = {}) {
  if (delta !== undefined && delta !== null) {
    const d = parseInt(delta, 10);
    if (Number.isNaN(d)) {
      throw new DomainError('Ajuste de estoque inválido.');
    }
    return Math.max(0, current + d);
  }

  const qty = parseInt(quantity || 0, 10);
  if (Number.isNaN(qty) || qty < 0) {
    throw new DomainError('Quantidade inválida.');
  }
  switch (action) {
    case 'add': return current + qty;
    case 'set': return qty;
    case 'subtract': return Math.max(0, current - qty);
    default: throw new DomainError('Ação de estoque inválida. Use delta ou action (add | set | subtract).');
  }
}

// Campos esperados pela tela; produtos sem custo/mínimo/ícone recebem valores padrão.
export function toProductView(product) {
  return {
    ...product,
    sale_price: product.price,
    cost_price: product.cost_price ?? round2(product.price * 0.65),
    min_stock: product.min_stock ?? DEFAULT_MIN_STOCK,
    image_url: product.image_url || CATEGORY_ICONS[product.category] || '📦'
  };
}
