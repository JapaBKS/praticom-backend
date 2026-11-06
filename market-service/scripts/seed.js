// Popula o MongoDB com alguns produtos de exemplo (rode uma vez: npm run seed).
import { loadConfig } from '../src/infrastructure/config.js';
import { buildContainer } from '../src/infrastructure/container.js';

const config = loadConfig();
if (config.storage !== 'mongo') {
  console.error('Defina MONGODB_URI para popular o banco.');
  process.exit(1);
}

const container = await buildContainer(config);
const { productService } = container;

if ((await productService.list()).length > 0) {
  console.log('Já existem produtos cadastrados; nada a fazer.');
} else {
  const products = [
    { name: 'Água mineral 500ml', category: 'Bebidas', price: 4.5, cost_price: 2.1, stock_quantity: 40, min_stock: 10 },
    { name: 'Refrigerante lata 350ml', category: 'Bebidas', price: 6, cost_price: 3.4, stock_quantity: 30, min_stock: 10 },
    { name: 'Salgadinho 80g', category: 'Snacks & Salgados', price: 7.9, cost_price: 4.8, stock_quantity: 20, min_stock: 5 },
    { name: 'Barra de chocolate', category: 'Doces', price: 8.5, cost_price: 5, stock_quantity: 25, min_stock: 5 },
    { name: 'Sorvete pote 1L', category: 'Congelados', price: 22, cost_price: 14, stock_quantity: 8, min_stock: 3 },
    { name: 'Sabonete', category: 'Higiene & Limpeza', price: 3.5, cost_price: 1.9, stock_quantity: 15, min_stock: 5 }
  ];
  for (const product of products) {
    await productService.create(product);
  }
  console.log(`${products.length} produtos criados.`);
}

await container.close();
