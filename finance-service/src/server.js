import { createApp } from './adapters/inbound/http/createApp.js';
import { loadConfig } from './infrastructure/config.js';
import { buildContainer } from './infrastructure/container.js';

const config = loadConfig();
const container = await buildContainer(config);
const app = createApp({
  transactionService: container.transactionService,
  internalApiKey: config.internalApiKey,
  acceptHttpEvents: config.acceptHttpEvents
});

const server = app.listen(config.port, () => {
  console.log(`finance-service na porta ${config.port} (storage: ${config.storage}, broker: ${config.broker})`);
  console.log(`Swagger: http://localhost:${config.port}/docs`);
});

const shutdown = async () => {
  server.close();
  await container.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
