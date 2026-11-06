import { createApp } from './adapters/inbound/http/createApp.js';
import { loadConfig } from './infrastructure/config.js';
import { buildContainer } from './infrastructure/container.js';

const config = loadConfig();
const container = await buildContainer(config);
const app = createApp({
  productService: container.productService,
  checkoutService: container.checkoutService,
  internalApiKey: config.internalApiKey
});

const server = app.listen(config.port, () => {
  console.log(`market-service na porta ${config.port} (storage: ${config.storage}, broker: ${config.broker})`);
  console.log(`Swagger: http://localhost:${config.port}/docs`);
});

const shutdown = async () => {
  server.close();
  await container.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
