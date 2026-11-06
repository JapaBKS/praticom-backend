import { ProductRepository } from '../../../application/ports.js';
import { nextId } from './mongo.js';

const NO_MONGO_ID = { projection: { _id: 0 } };

export class MongoProductRepository extends ProductRepository {
  constructor(db) {
    super();
    this.db = db;
    this.collection = db.collection('products');
  }

  async ensureIndexes() {
    await this.collection.createIndex({ id: 1 }, { unique: true });
  }

  async findAll() {
    return this.collection.find({}, NO_MONGO_ID).toArray();
  }

  async findById(id) {
    return this.collection.findOne({ id }, NO_MONGO_ID);
  }

  async insert(product) {
    const id = await nextId(this.db, 'products');
    await this.collection.insertOne({ ...product, id });
    return { ...product, id };
  }

  async update(id, product) {
    const { id: _ignored, ...fields } = product;
    await this.collection.updateOne({ id }, { $set: fields });
    return this.findById(id);
  }

  async delete(id) {
    const result = await this.collection.deleteOne({ id });
    return result.deletedCount > 0;
  }

  // Atômico no Mongo: o filtro só casa se ainda houver estoque suficiente.
  async decrementStock(id, quantity) {
    const result = await this.collection.updateOne(
      { id, stock_quantity: { $gte: quantity } },
      { $inc: { stock_quantity: -quantity } }
    );
    return result.modifiedCount === 1;
  }

  async incrementStock(id, quantity) {
    await this.collection.updateOne({ id }, { $inc: { stock_quantity: quantity } });
  }
}
