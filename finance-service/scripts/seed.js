// Popula o Azure SQL com alguns lançamentos de exemplo (rode uma vez: npm run seed).
import { loadConfig } from '../src/infrastructure/config.js';
import { buildContainer } from '../src/infrastructure/container.js';

const config = { ...loadConfig(), broker: 'none' };
if (config.storage !== 'sql') {
  console.error('Defina SQL_CONNECTION_STRING para popular o banco.');
  process.exit(1);
}

const container = await buildContainer(config);
const { transactionService } = container;

if ((await transactionService.list()).length > 0) {
  console.log('Já existem lançamentos; nada a fazer.');
} else {
  const today = transactionService.today();
  const shift = (days) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const samples = [
    { type: 'INCOME', category: 'Taxa condominial', description: 'Taxa condominial - Bloco A 101', amount: 450, due_date: shift(-20), unit_id: 1, status: 'PAID' },
    { type: 'INCOME', category: 'Taxa condominial', description: 'Taxa condominial - Bloco A 102', amount: 450, due_date: shift(-20), unit_id: 2 },
    { type: 'INCOME', category: 'Taxa condominial', description: 'Taxa condominial - Bloco B 101', amount: 450, due_date: shift(10), unit_id: 4 },
    { type: 'EXPENSE', category: 'Manutenção', description: 'Manutenção do portão', amount: 320, due_date: shift(-5), status: 'PAID' },
    { type: 'EXPENSE', category: 'Energia', description: 'Conta de luz das áreas comuns', amount: 610.4, due_date: shift(15) }
  ];
  for (const sample of samples) {
    await transactionService.create(sample);
  }
  console.log(`${samples.length} lançamentos criados.`);
}

await container.close();
