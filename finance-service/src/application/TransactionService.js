import { NotFoundError } from '../domain/errors.js';
import { summarize } from '../domain/Summary.js';
import {
  applyTransactionUpdate,
  assertDeletable,
  createTransaction,
  fromMarketSaleEvent,
  markPaid,
  toTransactionView
} from '../domain/Transaction.js';

function toId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new NotFoundError('Lançamento não encontrado.');
  }
  return id;
}

export class TransactionService {
  constructor({ transactionRepository, clock = () => new Date(), timeZone = 'America/Sao_Paulo', logger = console }) {
    this.transactionRepository = transactionRepository;
    this.clock = clock;
    this.timeZone = timeZone;
    this.logger = logger;
  }

  // "Hoje" no fuso do condomínio (en-CA formata como AAAA-MM-DD).
  today() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.timeZone }).format(this.clock());
  }

  async list({ status, type, category, search } = {}) {
    const today = this.today();
    const term = search ? String(search).toLowerCase() : '';
    const views = (await this.transactionRepository.findAll()).map((t) => toTransactionView(t, today));
    return views
      .filter((t) => !status || t.status === String(status).toUpperCase())
      .filter((t) => !type || t.type === String(type).toUpperCase())
      .filter((t) => !category || t.category === category)
      .filter((t) => !term || t.description.toLowerCase().includes(term))
      .sort((a, b) => b.due_date.localeCompare(a.due_date) || b.id - a.id);
  }

  async get(id) {
    return toTransactionView(await this.#require(id), this.today());
  }

  async create(data) {
    const saved = await this.transactionRepository.insert(createTransaction(data, this.clock()));
    return toTransactionView(saved, this.today());
  }

  async update(id, data) {
    const current = await this.#require(id);
    const saved = await this.transactionRepository.update(current.id, applyTransactionUpdate(current, data));
    return toTransactionView(saved, this.today());
  }

  async remove(id) {
    const current = await this.#require(id);
    assertDeletable(current);
    await this.transactionRepository.delete(current.id);
  }

  async pay(id) {
    const current = await this.#require(id);
    const saved = await this.transactionRepository.update(current.id, markPaid(current, this.clock()));
    return toTransactionView(saved, this.today());
  }

  async summary() {
    return summarize(await this.transactionRepository.findAll(), this.today());
  }

  // Chamado pelo consumidor do Service Bus (ou por HTTP no modo local). Idempotente pelo número da venda.
  async registerFromMarketSale(event) {
    const transaction = fromMarketSaleEvent(event, this.today());
    const existing = await this.transactionRepository.findBySourceRef(transaction.source_ref);
    if (existing) {
      this.logger.log(`Evento repetido ignorado (${transaction.source_ref}).`);
      return toTransactionView(existing, this.today());
    }
    const saved = await this.transactionRepository.insert(transaction);
    this.logger.log(`Receita ${saved.id} criada a partir de ${transaction.source_ref}.`);
    return toTransactionView(saved, this.today());
  }

  async #require(id) {
    const found = await this.transactionRepository.findById(toId(id));
    if (!found) {
      throw new NotFoundError('Lançamento não encontrado.');
    }
    return found;
  }
}
