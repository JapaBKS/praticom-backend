const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
});
const json = (schema) => ({ 'application/json': { schema } });

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Praticom - Microsserviço Financeiro',
    version: '1.0.0',
    description:
      'Lançamentos a pagar e a receber (Azure SQL Database). Recebe eventos do Mercadinho pelo Azure Service Bus e cria receitas pendentes. Chamadas protegidas exigem o header x-internal-key (usado pelo Gateway/BFF).'
  },
  components: {
    securitySchemes: { internalKey: { type: 'apiKey', in: 'header', name: 'x-internal-key' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      TransactionInput: {
        type: 'object',
        required: ['type', 'category', 'description', 'amount', 'due_date'],
        properties: {
          type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
          category: { type: 'string', example: 'Taxa condominial' },
          description: { type: 'string', example: 'Taxa de novembro' },
          amount: { type: 'number', example: 450 },
          due_date: { type: 'string', format: 'date', example: '2026-11-10' },
          unit_id: { type: 'integer', nullable: true }
        }
      },
      Transaction: {
        allOf: [
          { $ref: '#/components/schemas/TransactionInput' },
          {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              status: { type: 'string', enum: ['PENDING', 'PAID', 'OVERDUE'], description: 'OVERDUE é calculado: pendente com vencimento anterior a hoje.' },
              paid_at: { type: 'string', format: 'date-time', nullable: true },
              source_ref: { type: 'string', nullable: true }
            }
          }
        ]
      },
      Summary: {
        type: 'object',
        properties: {
          income: { type: 'object', properties: { paid: { type: 'number' }, pending: { type: 'number' }, overdue: { type: 'number' } } },
          expense: { type: 'object', properties: { paid: { type: 'number' }, pending: { type: 'number' }, overdue: { type: 'number' } } },
          currentBalance: { type: 'number' },
          default_amount: { type: 'number' },
          overdue_count: { type: 'integer' },
          delinquencyByUnit: { type: 'array', items: { type: 'object', properties: { unit_id: { type: 'integer' }, total_debt: { type: 'number' } } } }
        }
      },
      MarketSaleEvent: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          type: { type: 'string', example: 'market.sale.condo_bill' },
          saleId: { type: 'integer' },
          unitId: { type: 'integer' },
          residentId: { type: 'integer' },
          amount: { type: 'number' },
          occurredAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  },
  security: [{ internalKey: [] }],
  paths: {
    '/health': {
      get: { summary: 'Verifica se o serviço está no ar', security: [], responses: { 200: { description: 'OK' } } }
    },
    '/transactions': {
      get: {
        summary: 'Lista lançamentos',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'PAID', 'OVERDUE'] } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['INCOME', 'EXPENSE'] } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Lançamentos', content: json({ type: 'array', items: { $ref: '#/components/schemas/Transaction' } }) } }
      },
      post: {
        summary: 'Cria lançamento',
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/TransactionInput' }) },
        responses: { 201: { description: 'Criado', content: json({ $ref: '#/components/schemas/Transaction' }) }, 400: errorResponse('Dados inválidos') }
      }
    },
    '/transactions/{id}': {
      get: {
        summary: 'Busca lançamento',
        parameters: [idParam],
        responses: { 200: { description: 'Lançamento', content: json({ $ref: '#/components/schemas/Transaction' }) }, 404: errorResponse('Não encontrado') }
      },
      patch: {
        summary: 'Edita lançamento não pago',
        parameters: [idParam],
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/TransactionInput' }) },
        responses: { 200: { description: 'Atualizado', content: json({ $ref: '#/components/schemas/Transaction' }) }, 400: errorResponse('Dados inválidos ou lançamento já pago'), 404: errorResponse('Não encontrado') }
      },
      delete: {
        summary: 'Exclui lançamento não pago',
        parameters: [idParam],
        responses: { 200: { description: 'Excluído' }, 400: errorResponse('Lançamento já pago'), 404: errorResponse('Não encontrado') }
      }
    },
    '/transactions/{id}/pay': {
      patch: {
        summary: 'Dá baixa (marca como pago)',
        parameters: [idParam],
        responses: { 200: { description: 'Pago', content: json({ $ref: '#/components/schemas/Transaction' }) }, 400: errorResponse('Já estava pago'), 404: errorResponse('Não encontrado') }
      }
    },
    '/summary': {
      get: {
        summary: 'Resumo financeiro (receitas, despesas, saldo e inadimplência por unidade)',
        responses: { 200: { description: 'Resumo', content: json({ $ref: '#/components/schemas/Summary' }) } }
      }
    },
    '/internal/events': {
      post: {
        summary: 'DESENVOLVIMENTO LOCAL: recebe o evento do Mercadinho por HTTP quando não há Service Bus (desabilitado na nuvem)',
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/MarketSaleEvent' }) },
        responses: { 202: { description: 'Evento processado' }, 400: errorResponse('Evento inválido'), 404: errorResponse('Desabilitado') }
      }
    }
  }
};
