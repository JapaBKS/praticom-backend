// Toda a configuração vem de variáveis de ambiente (veja .env.example).
export function loadConfig(env = process.env) {
  const mongoUri = env.MONGODB_URI || '';
  const serviceBusConnectionString = env.SERVICEBUS_CONNECTION_STRING || '';
  const financeDevUrl = env.FINANCE_DEV_URL || '';

  return {
    port: Number(env.PORT) || 5001,
    internalApiKey: env.INTERNAL_API_KEY || '',
    storage: mongoUri ? 'mongo' : 'memory',
    mongoUri,
    mongoDb: env.MONGODB_DB || 'praticom_market',
    broker: serviceBusConnectionString ? 'servicebus' : financeDevUrl ? 'http' : 'log',
    serviceBusConnectionString,
    serviceBusQueue: env.SERVICEBUS_QUEUE || 'market-sale-condo-bill',
    financeDevUrl
  };
}
