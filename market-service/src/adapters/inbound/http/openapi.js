const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
});
const json = (schema) => ({ 'application/json': { schema } });

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Praticom - Microsserviço de Mercadinho',
    version: '1.0.0',
    description:
      'Produtos, estoque e vendas do mercadinho (MongoDB Atlas). Em compras com débito na cota condominial publica um evento no Azure Service Bus para o microsserviço Financeiro. Chamadas protegidas exigem o header x-internal-key (usado pelo Gateway/BFF).'
  },
  components: {
    securitySchemes: { internalKey: { type: 'apiKey', in: 'header', name: 'x-internal-key' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      ProductInput: {
        type: 'object',
        required: ['name', 'price'],
        properties: {
          name: { type: 'string', example: 'Água mineral 500ml' },
          category: { type: 'string', example: 'Bebidas' },
          price: { type: 'number', example: 4.5 },
          cost_price: { type: 'number', example: 2.1 },
          stock_quantity: { type: 'integer', example: 40 },
          min_stock: { type: 'integer', example: 5 },
          image_url: { type: 'string' },
          barcode: { type: 'string' }
        }
      },
      Product: {
        allOf: [
          { $ref: '#/components/schemas/ProductInput' },
          { type: 'object', properties: { id: { type: 'integer' }, sale_price: { type: 'number' } } }
        ]
      },
      StockChange: {
        type: 'object',
        properties: {
          delta: { type: 'integer', example: -3 },
          quantity: { type: 'integer' },
          action: { type: 'string', enum: ['add', 'set', 'subtract'] }
        }
      },
      CheckoutInput: {
        type: 'object',
        required: ['unit_id', 'resident_id', 'payment_method', 'items'],
        properties: {
          unit_id: { type: 'integer' },
          resident_id: { type: 'integer' },
          payment_method: { type: 'string', enum: ['pix', 'credit_card', 'condo_bill'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { product_id: { type: 'integer' }, quantity: { type: 'integer' } }
            }
          }
        }
      },
      Sale: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          unit_id: { type: 'integer' },
          resident_id: { type: 'integer' },
          total_amount: { type: 'number' },
          payment_method: { type: 'string', enum: ['PIX', 'CARD', 'CONDO_FEE'] },
          event_status: { type: 'string', enum: ['NOT_REQUIRED', 'PENDING', 'SENT'] },
          created_at: { type: 'string', format: 'date-time' },
          items: { type: 'array', items: { type: 'object' } }
        }
      }
    }
  },
  security: [{ internalKey: [] }],
  paths: {
    '/health': {
      get: { summary: 'Verifica se o serviço está no ar', security: [], responses: { 200: { description: 'OK' } } }
    },
    '/products': {
      get: {
        summary: 'Lista produtos',
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } }
        ],
        responses: { 200: { description: 'Lista de produtos', content: json({ type: 'array', items: { $ref: '#/components/schemas/Product' } }) } }
      },
      post: {
        summary: 'Cria produto',
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/ProductInput' }) },
        responses: { 201: { description: 'Criado', content: json({ $ref: '#/components/schemas/Product' }) }, 400: errorResponse('Dados inválidos') }
      }
    },
    '/products/{id}': {
      get: {
        summary: 'Busca produto',
        parameters: [idParam],
        responses: { 200: { description: 'Produto', content: json({ $ref: '#/components/schemas/Product' }) }, 404: errorResponse('Não encontrado') }
      },
      patch: {
        summary: 'Atualiza produto',
        parameters: [idParam],
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/ProductInput' }) },
        responses: { 200: { description: 'Atualizado', content: json({ $ref: '#/components/schemas/Product' }) }, 400: errorResponse('Dados inválidos'), 404: errorResponse('Não encontrado') }
      },
      delete: {
        summary: 'Exclui produto',
        parameters: [idParam],
        responses: { 200: { description: 'Excluído' }, 404: errorResponse('Não encontrado') }
      }
    },
    '/products/{id}/stock': {
      patch: {
        summary: 'Ajusta o estoque (delta ou quantity + action)',
        parameters: [idParam],
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/StockChange' }) },
        responses: { 200: { description: 'Produto com o novo estoque', content: json({ $ref: '#/components/schemas/Product' }) }, 400: errorResponse('Ajuste inválido'), 404: errorResponse('Não encontrado') }
      }
    },
    '/checkout': {
      post: {
        summary: 'Finaliza uma compra no PDV (baixa estoque e registra a venda)',
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/CheckoutInput' }) },
        responses: { 201: { description: 'Venda registrada', content: json({ $ref: '#/components/schemas/Sale' }) }, 400: errorResponse('Carrinho inválido ou estoque insuficiente'), 404: errorResponse('Produto não encontrado') }
      }
    },
    '/sales': {
      get: {
        summary: 'Lista vendas (mais recentes primeiro)',
        responses: { 200: { description: 'Vendas', content: json({ type: 'array', items: { $ref: '#/components/schemas/Sale' } }) } }
      }
    }
  }
};
