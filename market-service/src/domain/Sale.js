import { DomainError } from './errors.js';

const round2 = (n) => Math.round(n * 100) / 100;

export const PAYMENT_METHODS = {
  pix: 'PIX',
  credit_card: 'CARD',
  card: 'CARD',
  condo_bill: 'CONDO_FEE',
  condo_fee: 'CONDO_FEE'
};

export const CONDO_BILL_EVENT = 'market.sale.condo_bill';

export function resolvePaymentMethod(input) {
  const code = PAYMENT_METHODS[String(input ?? '').toLowerCase()];
  if (!code) {
    throw new DomainError('Forma de pagamento inválida.');
  }
  return code;
}

export function parseBuyer(unitId, residentId) {
  const unit = parseInt(unitId, 10);
  const resident = parseInt(residentId, 10);
  if (!unit) {
    throw new DomainError('Selecione a unidade do comprador.');
  }
  if (!resident) {
    throw new DomainError('Selecione o morador comprador.');
  }
  return { unitId: unit, residentId: resident };
}

// O total é sempre calculado com os preços do banco, nunca com o que a tela enviou.
export function buildSale({ unitId, residentId, paymentMethod, lines, now = new Date() }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new DomainError('Carrinho de compras vazio.');
  }
  const code = resolvePaymentMethod(paymentMethod);
  const items = lines.map((l) => ({
    product_id: l.product_id,
    name: l.name,
    price: l.price,
    quantity: l.quantity,
    line_total: round2(l.price * l.quantity)
  }));

  return {
    unit_id: unitId,
    resident_id: residentId,
    payment_method: code,
    total_amount: round2(items.reduce((sum, i) => sum + i.price * i.quantity, 0)),
    items,
    created_at: now.toISOString(),
    // Débito na cota condominial gera lançamento a receber no Financeiro (via Service Bus).
    event_status: code === 'CONDO_FEE' ? 'PENDING' : 'NOT_REQUIRED'
  };
}

export function requiresFinancialEntry(sale) {
  return sale.payment_method === 'CONDO_FEE';
}

// Contrato da mensagem publicada no broker e consumida pelo microsserviço Financeiro.
export function toCondoBillEvent(sale, eventId) {
  return {
    eventId,
    type: CONDO_BILL_EVENT,
    saleId: sale.id,
    unitId: sale.unit_id,
    residentId: sale.resident_id,
    amount: sale.total_amount,
    occurredAt: sale.created_at
  };
}
