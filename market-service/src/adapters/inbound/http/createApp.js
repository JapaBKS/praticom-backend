import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { DomainError, NotFoundError } from '../../../domain/errors.js';
import { openApiDocument } from './openapi.js';

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

// Adaptador de entrada HTTP: só traduz requisições para chamadas dos serviços de aplicação.
export function createApp({ productService, checkoutService, internalApiKey, logger = console }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'market-service' }));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  // Só o Gateway/BFF conhece a chave interna; chamadas diretas sem ela são recusadas.
  app.use((req, res, next) => {
    if (internalApiKey && req.get('x-internal-key') !== internalApiKey) {
      return res.status(401).json({ error: 'Acesso negado: chave interna ausente ou inválida.' });
    }
    return next();
  });

  app.get('/products', wrap(async (req, res) => {
    res.json(await productService.list(req.query));
  }));

  app.post('/products', wrap(async (req, res) => {
    res.status(201).json(await productService.create(req.body));
  }));

  app.get('/products/:id', wrap(async (req, res) => {
    res.json(await productService.get(req.params.id));
  }));

  app.patch('/products/:id', wrap(async (req, res) => {
    res.json(await productService.update(req.params.id, req.body));
  }));

  app.delete('/products/:id', wrap(async (req, res) => {
    await productService.remove(req.params.id);
    res.json({ message: 'Produto excluído com sucesso.' });
  }));

  app.patch('/products/:id/stock', wrap(async (req, res) => {
    res.json(await productService.adjustStock(req.params.id, req.body));
  }));

  app.post('/checkout', wrap(async (req, res) => {
    res.status(201).json(await checkoutService.checkout(req.body));
  }));

  app.get('/sales', wrap(async (_req, res) => {
    res.json(await checkoutService.listSales());
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof DomainError) {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'JSON inválido.' });
    }
    logger.error(error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return app;
}
