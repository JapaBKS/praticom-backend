// Porta (interface) da arquitetura hexagonal. Os adaptadores de saída implementam esta classe.

const notImplemented = (name) => {
  throw new Error(`${name}() não implementado pelo adaptador.`);
};

export class TransactionRepository {
  async findAll() { return notImplemented('findAll'); }
  async findById(_id) { return notImplemented('findById'); }
  // Usado para idempotência dos eventos do Service Bus.
  async findBySourceRef(_sourceRef) { return notImplemented('findBySourceRef'); }
  async insert(_transaction) { return notImplemented('insert'); }
  async update(_id, _transaction) { return notImplemented('update'); }
  async delete(_id) { return notImplemented('delete'); }
}
