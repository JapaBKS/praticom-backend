import { MongoClient } from 'mongodb';

export async function connectMongo({ uri, dbName }) {
  const client = new MongoClient(uri);
  await client.connect();
  return { client, db: client.db(dbName) };
}

// Ids numéricos sequenciais (como o AUTOINCREMENT do SQLite do Praticom), para a tela não precisar mudar.
export async function nextId(db, name) {
  const doc = await db
    .collection('counters')
    .findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return doc.seq;
}
