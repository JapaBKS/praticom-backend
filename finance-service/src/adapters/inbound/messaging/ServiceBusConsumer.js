import { ServiceBusClient } from '@azure/service-bus';
import { DomainError } from '../../../domain/errors.js';

// Adaptador de entrada: consome a fila do Azure Service Bus e chama o serviço de aplicação.
export class ServiceBusConsumer {
  constructor({ connectionString, queueName, transactionService, logger = console }) {
    this.client = new ServiceBusClient(connectionString);
    this.receiver = this.client.createReceiver(queueName);
    this.transactionService = transactionService;
    this.logger = logger;
  }

  start() {
    this.subscription = this.receiver.subscribe({
      processMessage: async (message) => {
        try {
          await this.transactionService.registerFromMarketSale(message.body);
        } catch (error) {
          if (error instanceof DomainError) {
            // Mensagem inválida não adianta tentar de novo: vai para a fila de mortos (dead-letter).
            await this.receiver.deadLetterMessage(message, {
              deadLetterReason: 'MensagemInvalida',
              deadLetterErrorDescription: error.message
            });
            return;
          }
          throw error; // erro técnico: a mensagem volta para a fila e é reentregue
        }
      },
      processError: async (args) => {
        this.logger.error(`Service Bus (${args.errorSource}): ${args.error.message}`);
      }
    });
    this.logger.log('Consumidor do Service Bus iniciado.');
  }

  async close() {
    await this.subscription?.close();
    await this.receiver.close();
    await this.client.close();
  }
}
