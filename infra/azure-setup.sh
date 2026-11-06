#!/usr/bin/env bash
# Cria (ou atualiza) e publica toda a solução Praticom no Azure. Rode no Azure Cloud Shell (Bash):
#   curl -fsSL https://raw.githubusercontent.com/JapaBKS/praticom-backend/main/infra/azure-setup.sh -o setup.sh && bash setup.sh
# Opcional: MONGODB_URI='mongodb+srv://...' bash setup.sh   (string do MongoDB Atlas)
#
# Pode ser executado de novo sem problema: recursos existentes são reaproveitados e as chaves são renovadas
# em todos os apps ao mesmo tempo. Nenhuma senha ou chave é exibida na tela.
set -euo pipefail

RG=${RG:-Praticom}
LOC=${LOC:-southafricanorth}          # região permitida pela política da assinatura Azure for Students
PLAN=${PLAN:-ASP-Praticom-8570}       # plano App Service F1 (gratuito) já existente
RUNTIME=${RUNTIME:-NODE:24-lts}
GH=${GH:-https://github.com/JapaBKS}
SUFFIX=${SUFFIX:-$(az account show --query id -o tsv | tr -d '-' | cut -c1-6)}

MARKET=praticom-market-$SUFFIX
FINANCE=praticom-finance-$SUFFIX
GATEWAY=praticom-gateway-$SUFFIX
SQLSRV=praticom-sql-$SUFFIX
SQLDB=praticom_finance
BUS=praticom-bus-$SUFFIX
QUEUE=market-sale-condo-bill
STORAGE=praticomfront$SUFFIX
WORK=${WORK:-$HOME/praticom-deploy}

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }

INTERNAL_API_KEY=$(openssl rand -hex 24)
SQL_ADMIN=praticomadmin
SQL_PASSWORD="Pr@$(openssl rand -hex 12)"

step "Grupo de recursos e plano ($RG / $PLAN em $LOC)"
exists az group show -n "$RG" || az group create -n "$RG" -l "$LOC" -o none
if ! exists az appservice plan show -g "$RG" -n "$PLAN"; then
  az appservice plan create -g "$RG" -n "$PLAN" -l "$LOC" --is-linux --sku F1 -o none
fi
az appservice plan show -g "$RG" -n "$PLAN" --query "{plano:name,sku:sku.name}" -o tsv

step "Azure SQL Database (oferta gratuita, pausa ao atingir o limite: nunca gera cobrança)"
if exists az sql server show -g "$RG" -n "$SQLSRV"; then
  az sql server update -g "$RG" -n "$SQLSRV" --admin-password "$SQL_PASSWORD" -o none
else
  az sql server create -g "$RG" -n "$SQLSRV" -l "$LOC" --admin-user "$SQL_ADMIN" --admin-password "$SQL_PASSWORD" -o none
fi
az sql server firewall-rule create -g "$RG" -s "$SQLSRV" -n AllowAzureServices \
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none
if ! exists az sql db show -g "$RG" -s "$SQLSRV" -n "$SQLDB"; then
  az sql db create -g "$RG" -s "$SQLSRV" -n "$SQLDB" \
    --edition GeneralPurpose --compute-model Serverless --family Gen5 --capacity 2 \
    --use-free-limit --free-limit-exhaustion-behavior AutoPause -o none
fi
az sql db show -g "$RG" -s "$SQLSRV" -n "$SQLDB" --query "{banco:name,ofertaGratuita:useFreeLimit,aoEsgotar:freeLimitExhaustionBehavior}" -o tsv
SQL_CONNECTION_STRING="Server=tcp:$SQLSRV.database.windows.net,1433;Initial Catalog=$SQLDB;User ID=$SQL_ADMIN;Password=$SQL_PASSWORD;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"

step "Azure Service Bus (Basic) e fila $QUEUE"
if ! exists az servicebus namespace show -g "$RG" -n "$BUS"; then
  az servicebus namespace create -g "$RG" -n "$BUS" -l "$LOC" --sku Basic -o none
fi
if ! exists az servicebus queue show -g "$RG" --namespace-name "$BUS" -n "$QUEUE"; then
  az servicebus queue create -g "$RG" --namespace-name "$BUS" -n "$QUEUE" -o none
fi
SERVICEBUS_CONNECTION_STRING=$(az servicebus namespace authorization-rule keys list -g "$RG" \
  --namespace-name "$BUS" -n RootManageSharedAccessKey --query primaryConnectionString -o tsv)

step "Web Apps ($MARKET, $FINANCE, $GATEWAY)"
for APP in "$MARKET" "$FINANCE" "$GATEWAY"; do
  if ! exists az webapp show -g "$RG" -n "$APP"; then
    az webapp create -g "$RG" -p "$PLAN" -n "$APP" --runtime "$RUNTIME" -o none
  fi
  az webapp config set -g "$RG" -n "$APP" --startup-file "npm start" -o none
done
host() { az webapp show -g "$RG" -n "$1" --query defaultHostName -o tsv; }
MARKET_HOST=$(host "$MARKET"); FINANCE_HOST=$(host "$FINANCE"); GATEWAY_HOST=$(host "$GATEWAY")

step "Conta de armazenamento com site estático ($STORAGE)"
if ! exists az storage account show -g "$RG" -n "$STORAGE"; then
  az storage account create -g "$RG" -n "$STORAGE" -l "$LOC" --sku Standard_LRS --kind StorageV2 \
    --min-tls-version TLS1_2 -o none
fi
STORAGE_CONN=$(az storage account show-connection-string -g "$RG" -n "$STORAGE" --query connectionString -o tsv)
az storage blob service-properties update --static-website --index-document index.html \
  --404-document index.html --connection-string "$STORAGE_CONN" -o none
SITE_URL=$(az storage account show -g "$RG" -n "$STORAGE" --query primaryEndpoints.web -o tsv)
SITE_URL=${SITE_URL%/}

step "Variáveis de ambiente dos apps"
COMMON=(INTERNAL_API_KEY="$INTERNAL_API_KEY" SCM_DO_BUILD_DURING_DEPLOYMENT=false WEBSITE_NODE_DEFAULT_VERSION=~24)
az webapp config appsettings set -g "$RG" -n "$FINANCE" -o none --settings "${COMMON[@]}" \
  SQL_CONNECTION_STRING="$SQL_CONNECTION_STRING" SERVICEBUS_CONNECTION_STRING="$SERVICEBUS_CONNECTION_STRING" \
  SERVICEBUS_QUEUE="$QUEUE" TIMEZONE=America/Sao_Paulo
az webapp config appsettings set -g "$RG" -n "$MARKET" -o none --settings "${COMMON[@]}" \
  SERVICEBUS_CONNECTION_STRING="$SERVICEBUS_CONNECTION_STRING" SERVICEBUS_QUEUE="$QUEUE" MONGODB_DB=praticom_market
if [ -n "${MONGODB_URI:-}" ]; then
  az webapp config appsettings set -g "$RG" -n "$MARKET" -o none --settings MONGODB_URI="$MONGODB_URI"
fi
az webapp config appsettings set -g "$RG" -n "$GATEWAY" -o none --settings "${COMMON[@]}" \
  MARKET_SERVICE_URL="https://$MARKET_HOST" FINANCE_SERVICE_URL="https://$FINANCE_HOST" \
  CORS_ORIGINS="$SITE_URL,http://localhost:3000"

step "Baixando o código dos repositórios"
rm -rf "$WORK" && mkdir -p "$WORK" && cd "$WORK"
for REPO in praticom-backend praticom-gateway-bff praticom-frontend; do
  git clone -q --depth 1 "$GH/$REPO" "$REPO"
done

# No plano F1 o Kudu costuma responder 502 enquanto ainda extrai o pacote; por isso o envio é assíncrono
# e o sucesso é confirmado pelo endpoint de saúde do próprio serviço.
deploy() { # deploy <pasta> <webapp> <caminho-health> <nome-do-servico>
  (cd "$1" && npm ci --omit=dev --no-audit --no-fund --loglevel=error && zip -qr "$WORK/$2.zip" . -x ".git/*")
  az webapp deploy -g "$RG" -n "$2" --src-path "$WORK/$2.zip" --type zip --async true --track-status false -o none \
    || echo "(aviso: o Kudu demorou a responder; conferindo se o app subiu...)"
  local url="https://$(host "$2")$3"
  for _ in $(seq 1 36); do
    if curl -s --max-time 60 "$url" | grep -q "\"$4\""; then echo "OK: $2 no ar"; return 0; fi
    sleep 10
  done
  echo "ERRO: $2 não respondeu em $url"; return 1
}
step "Publicando o microsserviço Financeiro";   deploy praticom-backend/finance-service "$FINANCE" /health finance-service
step "Publicando o microsserviço Mercadinho";   deploy praticom-backend/market-service "$MARKET" /health market-service
step "Publicando o Gateway/BFF";                deploy praticom-gateway-bff "$GATEWAY" /api/health praticom-gateway-bff

step "Build e publicação do frontend (Module Federation) no site estático"
(cd praticom-frontend && npm ci --no-audit --no-fund --loglevel=error && VITE_API_URL="https://$GATEWAY_HOST/api" npm run build >/dev/null)
az storage blob upload-batch -s praticom-frontend/dist -d '$web' --overwrite --connection-string "$STORAGE_CONN" -o none
az storage blob upload -c '$web' -n market/assets/remoteEntry.js -f praticom-frontend/dist/market/assets/remoteEntry.js \
  --content-cache-control no-cache --overwrite --connection-string "$STORAGE_CONN" -o none
az storage blob upload -c '$web' -n finance/assets/remoteEntry.js -f praticom-frontend/dist/finance/assets/remoteEntry.js \
  --content-cache-control no-cache --overwrite --connection-string "$STORAGE_CONN" -o none

step "Verificando (o plano gratuito pode levar ~1 min para acordar os apps)"
for i in $(seq 1 12); do
  STATUS=$(curl -s --max-time 60 "https://$GATEWAY_HOST/api/bff/status" || true)
  if echo "$STATUS" | grep -q '"finance":"UP"' && echo "$STATUS" | grep -q '"market":"UP"'; then break; fi
  sleep 10
done
echo "$STATUS"

cat <<EOF

==================== PRATICOM NO AZURE ====================
Site (frontend):     $SITE_URL
Gateway/BFF:         https://$GATEWAY_HOST   (Swagger: /docs)
Mercadinho:          https://$MARKET_HOST    (Swagger: /docs)
Financeiro:          https://$FINANCE_HOST   (Swagger: /docs)
Service Bus:         $BUS / fila $QUEUE
Azure SQL:           $SQLSRV / $SQLDB (oferta gratuita)
MongoDB Atlas:       $([ -n "${MONGODB_URI:-}" ] && echo configurado || echo "PENDENTE: rode de novo com MONGODB_URI=...")
===========================================================
EOF
