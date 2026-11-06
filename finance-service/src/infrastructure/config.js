// Toda a configuração vem de variáveis de ambiente (veja .env.example).
export function loadConfig(env = process.env) {
  const sqlConnectionString = env.SQL_CONNECTION_STRING || '';
  const serviceBusConnectionString = env.SERVICEBUS_CONNECTION_STRING || '';

  return {
    port: Number(env.PORT) || 5002,
    internalApiKey: env.INTERNAL_API_KEY || '',
    timeZone: env.TIMEZONE || 'America/Sao_Paulo',
    storage: sqlConnectionString ? 'sql' : 'memory',
    sqlConnectionString,
    broker: serviceBusConnectionString ? 'servicebus' : 'http',
    serviceBusConnectionString,
    serviceBusQueue: env.SERVICEBUS_QUEUE || 'market-sale-condo-bill',
    // Sem Service Bus, aceita o evento por HTTP (apenas desenvolvimento local).
    acceptHttpEvents: !serviceBusConnectionString
  };
}
