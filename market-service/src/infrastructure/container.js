import { CheckoutService } from '../application/CheckoutService.js';
import { ProductService } from '../application/ProductService.js';
import { InMemoryProductRepository, InMemorySaleRepository } from '../adapters/outbound/memory/InMemoryRepositories.js';
import { HttpDevEventPublisher, LogEventPublisher } from '../adapters/outbound/messaging/DevEventPublishers.js';

// Raiz de composição: escolhe os adaptadores conforme a configuração e liga tudo.
export async function buildContainer(config, logger = console) {
  const closers = [];
  let productRepository;
  let saleRepository;

  if (config.storage === 'mongo') {
    const { connectMongo } = await import('../adapters/outbound/mongo/mongo.js');
    const { MongoProductRepository } = await import('../adapters/outbound/mongo/MongoProductRepository.js');
    const { MongoSaleRepository } = await import('../adapters/outbound/mongo/MongoSaleRepository.js');
    const { client, db } = await connectMongo({ uri: config.mongoUri, dbName: config.mongoDb });
    productRepository = new MongoProductRepository(db);
    saleRepository = new MongoSaleRepository(db);
    await productRepository.ensureIndexes();
    await saleRepository.ensureIndexes();
    closers.push(() => client.close());
  } else {
    logger.warn('MONGODB_URI não definida: usando armazenamento em memória (dados somem ao reiniciar).');
    productRepository = new InMemoryProductRepository();
    saleRepository = new InMemorySaleRepository();
  }

  let eventPublisher;
  if (config.broker === 'servicebus') {
    const { ServiceBusEventPublisher } = await import('../adapters/outbound/messaging/ServiceBusEventPublisher.js');
    eventPublisher = new ServiceBusEventPublisher({
      connectionString: config.serviceBusConnectionString,
      queueName: config.serviceBusQueue
    });
    closers.push(() => eventPublisher.close());
  } else if (config.broker === 'http') {
    eventPublisher = new HttpDevEventPublisher({ baseUrl: config.financeDevUrl, internalApiKey: config.internalApiKey });
  } else {
    logger.warn('Nenhum broker configurado: eventos serão apenas registrados no log.');
    eventPublisher = new LogEventPublisher(logger);
  }

  return {
    productService: new ProductService({ productRepository }),
    checkoutService: new CheckoutService({ productRepository, saleRepository, eventPublisher, logger }),
    close: async () => {
      for (const close of closers) {
        await close();
      }
    }
  };
}
