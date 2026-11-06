import { TransactionService } from '../application/TransactionService.js';
import { InMemoryTransactionRepository } from '../adapters/outbound/memory/InMemoryTransactionRepository.js';

// Raiz de composição: escolhe os adaptadores conforme a configuração e liga tudo.
export async function buildContainer(config, logger = console) {
  const closers = [];
  let transactionRepository;

  if (config.storage === 'sql') {
    const { connectSql, SqlTransactionRepository } = await import('../adapters/outbound/sql/SqlTransactionRepository.js');
    const pool = await connectSql(config.sqlConnectionString);
    transactionRepository = new SqlTransactionRepository(pool);
    await transactionRepository.ensureSchema();
    closers.push(() => pool.close());
  } else {
    logger.warn('SQL_CONNECTION_STRING não definida: usando armazenamento em memória (dados somem ao reiniciar).');
    transactionRepository = new InMemoryTransactionRepository();
  }

  const transactionService = new TransactionService({
    transactionRepository,
    timeZone: config.timeZone,
    logger
  });

  if (config.broker === 'servicebus') {
    const { ServiceBusConsumer } = await import('../adapters/inbound/messaging/ServiceBusConsumer.js');
    const consumer = new ServiceBusConsumer({
      connectionString: config.serviceBusConnectionString,
      queueName: config.serviceBusQueue,
      transactionService,
      logger
    });
    consumer.start();
    closers.push(() => consumer.close());
  } else {
    logger.warn('Service Bus não configurado: eventos só chegam por POST /internal/events (desenvolvimento local).');
  }

  return {
    transactionService,
    close: async () => {
      for (const close of closers) {
        await close();
      }
    }
  };
}
