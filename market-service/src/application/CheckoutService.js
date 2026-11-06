import { randomUUID } from 'node:crypto';
import { DomainError, NotFoundError } from '../domain/errors.js';
import {
  buildSale,
  parseBuyer,
  requiresFinancialEntry,
  resolvePaymentMethod,
  toCondoBillEvent
} from '../domain/Sale.js';

export class CheckoutService {
  constructor({ productRepository, saleRepository, eventPublisher, logger = console }) {
    this.productRepository = productRepository;
    this.saleRepository = saleRepository;
    this.eventPublisher = eventPublisher;
    this.logger = logger;
  }

  // O carrinho informa só QUAIS produtos e QUANTOS; preço e total vêm sempre do banco.
  async checkout({ unit_id, resident_id, payment_method, items } = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new DomainError('Carrinho de compras vazio.');
    }
    resolvePaymentMethod(payment_method);
    const { unitId, residentId } = parseBuyer(unit_id, resident_id);

    const reserved = [];
    try {
      const lines = [];
      for (const item of items) {
        lines.push(await this.#reserveStock(item, reserved));
      }

      const sale = buildSale({ unitId, residentId, paymentMethod: payment_method, lines });
      const saved = await this.saleRepository.insert(sale);
      return await this.#publishIfNeeded(saved);
    } catch (error) {
      // Compensação: o Mongo não tem transação entre produtos, então devolvemos o estoque já baixado.
      for (const r of reserved) {
        await this.productRepository.incrementStock(r.productId, r.quantity);
      }
      throw error;
    }
  }

  async listSales() {
    const sales = await this.saleRepository.findAll();
    return sales.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  async #reserveStock(item, reserved) {
    const productId = parseInt(item.product_id || item.id, 10);
    const quantity = Number(item.quantity);
    if (!productId) {
      throw new DomainError('Item do carrinho sem produto.');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new DomainError('Quantidade inválida no carrinho.');
    }

    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError(`Produto ID ${productId} não foi encontrado.`);
    }

    const ok = await this.productRepository.decrementStock(productId, quantity);
    if (!ok) {
      const fresh = await this.productRepository.findById(productId);
      throw new DomainError(
        `Estoque insuficiente para o produto '${product.name}'. Disponível: ${fresh?.stock_quantity ?? 0}, solicitado: ${quantity}.`
      );
    }
    reserved.push({ productId, quantity });
    return { product_id: product.id, name: product.name, price: product.price, quantity };
  }

  // Publicação "melhor esforço": se o broker falhar, a venda continua válida com event_status PENDING.
  async #publishIfNeeded(sale) {
    if (!requiresFinancialEntry(sale)) {
      return sale;
    }
    try {
      await this.eventPublisher.publish(toCondoBillEvent(sale, randomUUID()));
      await this.saleRepository.markEventSent(sale.id);
      return { ...sale, event_status: 'SENT' };
    } catch (error) {
      this.logger.error(`Falha ao publicar evento da venda ${sale.id}: ${error.message}`);
      return sale;
    }
  }
}
