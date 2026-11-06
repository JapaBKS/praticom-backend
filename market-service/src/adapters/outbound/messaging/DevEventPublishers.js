import { EventPublisher } from '../../../application/ports.js';

// Alternativas SÓ para desenvolvimento local (sem Azure Service Bus). Na nuvem usa-se o ServiceBusEventPublisher.

// Entrega o evento direto no microsserviço Financeiro por HTTP.
export class HttpDevEventPublisher extends EventPublisher {
  constructor({ baseUrl, internalApiKey }) {
    super();
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.internalApiKey = internalApiKey;
  }

  async publish(event) {
    const response = await fetch(`${this.baseUrl}/internal/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': this.internalApiKey ?? '' },
      body: JSON.stringify(event)
    });
    if (!response.ok) {
      throw new Error(`Financeiro respondeu HTTP ${response.status}`);
    }
  }
}

// Só registra no log (nenhum broker configurado).
export class LogEventPublisher extends EventPublisher {
  constructor(logger = console) {
    super();
    this.logger = logger;
  }

  async publish(event) {
    this.logger.log(`[evento sem broker] ${JSON.stringify(event)}`);
  }
}
