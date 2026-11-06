import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { DomainError, NotFoundError } from '../../../domain/errors.js';
import { openApiDocument } from './openapi.js';

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

// Adaptador de entrada HTTP: só traduz requisições para chamadas do serviço de aplicação.
export function createApp({ transactionService, internalApiKey, acceptHttpEvents = false, logger = console }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'finance-service' }));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  // Só o Gateway/BFF conhece a chave interna; chamadas diretas sem ela são recusadas.
  app.use((req, res, next) => {
    if (internalApiKey && req.get('x-internal-key') !== internalApiKey) {
      return res.status(401).json({ error: 'Acesso negado: chave interna ausente ou inválida.' });
    }
    return next();
  });

  app.get('/transactions', wrap(async (req, res) => {
    res.json(await transactionService.list(req.query));
  }));

  app.post('/transactions', wrap(async (req, res) => {
    res.status(201).json(await transactionService.create(req.body));
  }));

  app.get('/transactions/:id', wrap(async (req, res) => {
    res.json(await transactionService.get(req.params.id));
  }));

  app.patch('/transactions/:id', wrap(async (req, res) => {
    res.json(await transactionService.update(req.params.id, req.body));
  }));

  app.delete('/transactions/:id', wrap(async (req, res) => {
    await transactionService.remove(req.params.id);
    res.json({ message: 'Lançamento excluído com sucesso.' });
  }));

  app.patch('/transactions/:id/pay', wrap(async (req, res) => {
    res.json(await transactionService.pay(req.params.id));
  }));

  app.get('/summary', wrap(async (_req, res) => {
    res.json(await transactionService.summary());
  }));

  // Só existe em desenvolvimento local, para simular o Service Bus. Na nuvem os eventos chegam pelo consumidor da fila.
  app.post('/internal/events', wrap(async (req, res) => {
    if (!acceptHttpEvents) {
      throw new NotFoundError('Recurso indisponível.');
    }
    await transactionService.registerFromMarketSale(req.body);
    res.status(202).json({ message: 'Evento processado.' });
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
