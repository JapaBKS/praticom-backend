import { SaleRepository } from '../../../application/ports.js';
import { nextId } from './mongo.js';

const NO_MONGO_ID = { projection: { _id: 0 } };

export class MongoSaleRepository extends SaleRepository {
  constructor(db) {
    super();
    this.db = db;
    this.collection = db.collection('sales');
  }

  async ensureIndexes() {
    await this.collection.createIndex({ id: 1 }, { unique: true });
  }

  async insert(sale) {
    const id = await nextId(this.db, 'sales');
    await this.collection.insertOne({ ...sale, id });
    return { ...sale, id };
  }

  async findAll() {
    return this.collection.find({}, NO_MONGO_ID).sort({ created_at: -1 }).toArray();
  }

  async markEventSent(id) {
    await this.collection.updateOne({ id }, { $set: { event_status: 'SENT' } });
  }
}
