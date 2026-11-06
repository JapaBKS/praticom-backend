import { NotFoundError } from '../domain/errors.js';
import { applyProductUpdate, applyStockChange, createProduct, toProductView } from '../domain/Product.js';

function toId(value) {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id)) {
    throw new NotFoundError('Produto não encontrado.');
  }
  return id;
}

export class ProductService {
  constructor({ productRepository }) {
    this.productRepository = productRepository;
  }

  async list({ category, search } = {}) {
    let products = await this.productRepository.findAll();
    if (category) {
      products = products.filter((p) => p.category === category);
    }
    if (search) {
      const term = String(search).toLowerCase();
      products = products.filter(
        (p) => p.name.toLowerCase().includes(term) || String(p.barcode ?? '').includes(term)
      );
    }
    return products
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map(toProductView);
  }

  async get(id) {
    const product = await this.productRepository.findById(toId(id));
    if (!product) {
      throw new NotFoundError('Produto não encontrado.');
    }
    return toProductView(product);
  }

  async create(data) {
    const saved = await this.productRepository.insert(createProduct(data));
    return toProductView(saved);
  }

  async update(id, data) {
    const current = await this.#requireProduct(id);
    const saved = await this.productRepository.update(current.id, applyProductUpdate(current, data));
    return toProductView(saved);
  }

  async remove(id) {
    const current = await this.#requireProduct(id);
    await this.productRepository.delete(current.id);
  }

  async adjustStock(id, change) {
    const current = await this.#requireProduct(id);
    const stock = applyStockChange(current.stock_quantity, change);
    const saved = await this.productRepository.update(current.id, { ...current, stock_quantity: stock });
    return toProductView(saved);
  }

  async #requireProduct(id) {
    const product = await this.productRepository.findById(toId(id));
    if (!product) {
      throw new NotFoundError('Produto não encontrado.');
    }
    return product;
  }
}
