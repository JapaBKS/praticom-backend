import { ProductRepository, SaleRepository } from '../../../application/ports.js';

// Adaptadores em memória: usados nos testes e para rodar localmente sem MongoDB.
export class InMemoryProductRepository extends ProductRepository {
  constructor() {
    super();
    this.items = new Map();
    this.sequence = 0;
  }

  async findAll() {
    return [...this.items.values()].map((p) => ({ ...p }));
  }

  async findById(id) {
    const found = this.items.get(id);
    return found ? { ...found } : null;
  }

  async insert(product) {
    const saved = { ...product, id: ++this.sequence };
    this.items.set(saved.id, saved);
    return { ...saved };
  }

  async update(id, product) {
    this.items.set(id, { ...product, id });
    return { ...this.items.get(id) };
  }

  async delete(id) {
    return this.items.delete(id);
  }

  async decrementStock(id, quantity) {
    const found = this.items.get(id);
    if (!found || found.stock_quantity < quantity) {
      return false;
    }
    found.stock_quantity -= quantity;
    return true;
  }

  async incrementStock(id, quantity) {
    const found = this.items.get(id);
    if (found) {
      found.stock_quantity += quantity;
    }
  }
}

export class InMemorySaleRepository extends SaleRepository {
  constructor() {
    super();
    this.items = [];
    this.sequence = 0;
  }

  async insert(sale) {
    const saved = { ...sale, id: ++this.sequence };
    this.items.push(saved);
    return { ...saved };
  }

  async findAll() {
    return this.items.map((s) => ({ ...s }));
  }

  async markEventSent(id) {
    const found = this.items.find((s) => s.id === id);
    if (found) {
      found.event_status = 'SENT';
    }
  }
}
