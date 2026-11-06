import { ServiceBusClient } from '@azure/service-bus';
import { EventPublisher } from '../../../application/ports.js';

// Publica o evento na fila do Azure Service Bus.
export class ServiceBusEventPublisher extends EventPublisher {
  constructor({ connectionString, queueName }) {
    super();
    this.client = new ServiceBusClient(connectionString);
    this.sender = this.client.createSender(queueName);
  }

  async publish(event) {
    await this.sender.sendMessages({
      body: event,
      contentType: 'application/json',
      messageId: event.eventId,
      subject: event.type
    });
  }

  async close() {
    await this.sender.close();
    await this.client.close();
  }
}
