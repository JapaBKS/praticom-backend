import { TransactionRepository } from '../../../application/ports.js';

// Adaptador em memória: usado nos testes e para rodar localmente sem Azure SQL.
export class InMemoryTransactionRepository extends TransactionRepository {
  constructor() {
    super();
    this.items = new Map();
    this.sequence = 0;
  }

  async findAll() {
    return [...this.items.values()].map((t) => ({ ...t }));
  }

  async findById(id) {
    const found = this.items.get(id);
    return found ? { ...found } : null;
  }

  async findBySourceRef(sourceRef) {
    const found = [...this.items.values()].find((t) => t.source_ref === sourceRef);
    return found ? { ...found } : null;
  }

  async insert(transaction) {
    const saved = { ...transaction, id: ++this.sequence };
    this.items.set(saved.id, saved);
    return { ...saved };
  }

  async update(id, transaction) {
    this.items.set(id, { ...transaction, id });
    return { ...this.items.get(id) };
  }

  async delete(id) {
    return this.items.delete(id);
  }
}
