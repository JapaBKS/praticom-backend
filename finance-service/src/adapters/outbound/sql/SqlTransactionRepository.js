import sql from 'mssql';
import { TransactionRepository } from '../../../application/ports.js';

const SCHEMA = `
IF OBJECT_ID('dbo.financial_transactions', 'U') IS NULL
CREATE TABLE dbo.financial_transactions (
  id INT IDENTITY(1,1) PRIMARY KEY,
  unit_id INT NULL,
  description NVARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  type VARCHAR(10) NOT NULL,
  category NVARCHAR(100) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  due_date DATE NOT NULL,
  paid_at DATETIME2 NULL,
  source_ref VARCHAR(100) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_financial_transactions_source_ref')
CREATE UNIQUE INDEX UX_financial_transactions_source_ref
  ON dbo.financial_transactions (source_ref) WHERE source_ref IS NOT NULL;
`;

const toIsoDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value);

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    unit_id: row.unit_id,
    description: row.description,
    amount: Number(row.amount),
    type: row.type,
    category: row.category,
    status: row.status,
    due_date: toIsoDate(row.due_date),
    paid_at: row.paid_at instanceof Date ? row.paid_at.toISOString() : row.paid_at,
    source_ref: row.source_ref
  };
}

export async function connectSql(connectionString) {
  const pool = new sql.ConnectionPool(connectionString);
  await pool.connect();
  return pool;
}

// Adaptador de saída para o Azure SQL Database (consultas parametrizadas, sem concatenar texto).
export class SqlTransactionRepository extends TransactionRepository {
  constructor(pool) {
    super();
    this.pool = pool;
  }

  async ensureSchema() {
    await this.pool.request().batch(SCHEMA);
  }

  async findAll() {
    const result = await this.pool.request().query('SELECT * FROM dbo.financial_transactions ORDER BY due_date DESC, id DESC');
    return result.recordset.map(fromRow);
  }

  async findById(id) {
    const result = await this.pool.request().input('id', sql.Int, id)
      .query('SELECT * FROM dbo.financial_transactions WHERE id = @id');
    return fromRow(result.recordset[0]);
  }

  async findBySourceRef(sourceRef) {
    const result = await this.pool.request().input('ref', sql.VarChar(100), sourceRef)
      .query('SELECT * FROM dbo.financial_transactions WHERE source_ref = @ref');
    return fromRow(result.recordset[0]);
  }

  async insert(tx) {
    const result = this.#bind(this.pool.request(), tx).query(`
      INSERT INTO dbo.financial_transactions
        (unit_id, description, amount, type, category, status, due_date, paid_at, source_ref)
      OUTPUT INSERTED.*
      VALUES (@unit_id, @description, @amount, @type, @category, @status, @due_date, @paid_at, @source_ref)
    `);
    return fromRow((await result).recordset[0]);
  }

  async update(id, tx) {
    const result = this.#bind(this.pool.request().input('id', sql.Int, id), tx).query(`
      UPDATE dbo.financial_transactions
      SET unit_id = @unit_id, description = @description, amount = @amount, type = @type,
          category = @category, status = @status, due_date = @due_date, paid_at = @paid_at
      OUTPUT INSERTED.*
      WHERE id = @id
    `);
    return fromRow((await result).recordset[0]);
  }

  async delete(id) {
    const result = await this.pool.request().input('id', sql.Int, id)
      .query('DELETE FROM dbo.financial_transactions WHERE id = @id');
    return result.rowsAffected[0] > 0;
  }

  #bind(request, tx) {
    return request
      .input('unit_id', sql.Int, tx.unit_id)
      .input('description', sql.NVarChar(255), tx.description)
      .input('amount', sql.Decimal(12, 2), tx.amount)
      .input('type', sql.VarChar(10), tx.type)
      .input('category', sql.NVarChar(100), tx.category)
      .input('status', sql.VarChar(10), tx.status)
      .input('due_date', sql.Date, new Date(`${tx.due_date}T00:00:00Z`))
      .input('paid_at', sql.DateTime2, tx.paid_at ? new Date(tx.paid_at) : null)
      .input('source_ref', sql.VarChar(100), tx.source_ref);
  }
}
