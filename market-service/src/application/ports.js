// Portas (interfaces) da arquitetura hexagonal. Os adaptadores de saída implementam estas classes.

const notImplemented = (name) => {
  throw new Error(`${name}() não implementado pelo adaptador.`);
};

export class ProductRepository {
  async findAll() { return notImplemented('findAll'); }
  async findById(_id) { return notImplemented('findById'); }
  async insert(_product) { return notImplemented('insert'); }
  async update(_id, _product) { return notImplemented('update'); }
  async delete(_id) { return notImplemented('delete'); }
  // Baixa atômica: só decrementa se houver estoque suficiente. Retorna true/false.
  async decrementStock(_id, _quantity) { return notImplemented('decrementStock'); }
  async incrementStock(_id, _quantity) { return notImplemented('incrementStock'); }
}

export class SaleRepository {
  async insert(_sale) { return notImplemented('insert'); }
  async findAll() { return notImplemented('findAll'); }
  async markEventSent(_id) { return notImplemented('markEventSent'); }
}

export class EventPublisher {
  async publish(_event) { return notImplemented('publish'); }
}
