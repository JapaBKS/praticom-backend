# Praticom · Microsserviços

Dois microsserviços independentes, cada um com o **próprio banco de dados** (*Database per Service*), comunicando-se pelo **Azure Service Bus**.

| Microsserviço | Domínio | Banco | Publicado em (Azure Web App) | Swagger |
|---|---|---|---|---|
| [`market-service`](market-service) | Mercadinho: produtos, estoque, PDV e vendas | **MongoDB Atlas** (Free Tier) | https://praticom-market-dd687f.azurewebsites.net | `/docs` |
| [`finance-service`](finance-service) | Financeiro: lançamentos, baixa, resumo e inadimplência | **Azure SQL Database** | https://praticom-finance-dd687f.azurewebsites.net | `/docs` |

| | Endereço |
|---|---|
| 🌐 Site (Azure Storage, site estático) | https://praticomfrontdd687f.z1.web.core.windows.net |
| 🔀 Gateway/BFF | https://praticom-gateway-dd687f.azurewebsites.net/docs |
| 🎥 Vídeo de apresentação (YouTube, não listado) | https://youtu.be/SEU-VIDEO |
| 📦 Repositório do frontend | https://github.com/JapaBKS/praticom-frontend |
| 📦 Repositório do Gateway/BFF | https://github.com/JapaBKS/praticom-gateway-bff |

**Alunos:** veja [GRUPO.md](GRUPO.md).

## CRUDs

| CRUD | Criar | Ler | Atualizar | Excluir | Extra |
|---|---|---|---|---|---|
| **Produtos** (Mongo) | `POST /products` | `GET /products`, `GET /products/{id}` | `PATCH /products/{id}` | `DELETE /products/{id}` | `PATCH /products/{id}/stock`, `POST /checkout`, `GET /sales` |
| **Lançamentos** (Azure SQL) | `POST /transactions` | `GET /transactions`, `GET /transactions/{id}` | `PATCH /transactions/{id}` | `DELETE /transactions/{id}` | `PATCH /transactions/{id}/pay`, `GET /summary` |

**Mensageria:** quando uma compra é paga com débito na cota condominial, o `market-service` publica `market.sale.condo_bill` na fila `market-sale-condo-bill`. O `finance-service` consome a mensagem e cria uma receita pendente para a unidade, com vencimento em 30 dias. O consumo é idempotente, e mensagens inválidas vão para a dead-letter.

## Estrutura (hexagonal, igual nos dois serviços)

```
<serviço>/
├── src/
│   ├── domain/                  # regras puras (reaproveitadas dos DAOs do Praticom original)
│   ├── application/             # casos de uso + portas (interfaces)
│   ├── adapters/inbound/        # HTTP/Express + Swagger (e consumidor do Service Bus no Financeiro)
│   ├── adapters/outbound/       # MongoDB ou Azure SQL, publicador do Service Bus, versões em memória
│   ├── infrastructure/          # configuração e composição (injeção de dependências)
│   └── server.js
├── scripts/seed.js              # dados de exemplo
└── test/                        # unitários + arquitetura
```

## Como rodar localmente

Pré-requisito: Node.js 20+. Sem `MONGODB_URI`/`SQL_CONNECTION_STRING`, os serviços usam **armazenamento em memória**. Sem Service Bus, o Mercadinho entrega o evento ao Financeiro por HTTP (`FINANCE_DEV_URL`).

```bash
# Terminal 1 - Financeiro (porta 5002)
cd finance-service
npm install
cp .env.example .env      # deixe SQL_CONNECTION_STRING e SERVICEBUS_CONNECTION_STRING vazios para memória
npm run dev

# Terminal 2 - Mercadinho (porta 5001)
cd market-service
npm install
cp .env.example .env      # deixe MONGODB_URI e SERVICEBUS_CONNECTION_STRING vazios e use FINANCE_DEV_URL=http://localhost:5002
npm run dev
```

Use a mesma `INTERNAL_API_KEY` nos dois serviços e no Gateway. Os Swaggers ficam em http://localhost:5001/docs e http://localhost:5002/docs (envie o header `x-internal-key`). Com os bancos reais configurados, `npm run seed` cria dados de exemplo.

## Testes

```bash
cd market-service && npm test
cd ../finance-service && npm test
```

- **Unitários:** regras de domínio (preço, estoque, pagamento, vencimento, resumo), casos de uso (checkout com compensação de estoque, publicação do evento, idempotência) e rotas HTTP (CRUD completo, 400/404/401).
- **Arquitetura** (`test/architecture.test.js`): `domain` não depende de nada; `application` só de `domain`; adaptadores de entrada e de saída não se conhecem.

## Deploy na Azure

### Recursos de dados e mensageria

1. **MongoDB Atlas:** crie um cluster **M0 (Free)**, um usuário de banco e, em *Network Access*, libere `0.0.0.0/0` (o App Service não tem IP fixo). Copie a connection string para `MONGODB_URI`.
2. **Azure SQL Database:** crie o servidor e o banco `praticom_finance` (oferta gratuita ou Basic). Em *Rede*, marque **Permitir que serviços do Azure acessem este servidor**. Copie a string **ADO.NET** (com a senha) para `SQL_CONNECTION_STRING`. A tabela é criada automaticamente na primeira execução.
3. **Azure Service Bus:** crie um namespace (camada **Basic**) e uma **fila** `market-sale-condo-bill`. Copie a connection string (*Políticas de acesso compartilhado > RootManageSharedAccessKey*) para `SERVICEBUS_CONNECTION_STRING` nos dois serviços.

### Web Apps (um por microsserviço)

1. Crie dois **Web Apps** (*Código*, **Node 20 LTS**, **Linux**). Por exemplo: `praticom-market` e `praticom-finance`.
2. Em *Variáveis de ambiente*, cadastre as chaves do `.env.example` de cada serviço, sem `PORT` e sem `FINANCE_DEV_URL`.
3. No Financeiro, ative **Sempre ativado** se o plano permitir (B1+), para o consumidor da fila ficar sempre escutando.
4. Ative **SCM Basic Auth Publishing Credentials** e baixe o **perfil de publicação** de cada Web App.
5. No GitHub (*Settings > Secrets and variables > Actions*), cadastre:
   - secrets `AZURE_MARKET_PUBLISH_PROFILE` e `AZURE_FINANCE_PUBLISH_PROFILE`;
   - variables `AZURE_MARKET_WEBAPP_NAME` e `AZURE_FINANCE_WEBAPP_NAME`.
6. Faça push na `main`. Os workflows em `.github/workflows/` testam e publicam cada serviço quando a pasta dele muda.

## Arquitetura (Arc42)

A solução é a mesma nos três repositórios; esta seção descreve o sistema inteiro e indica o papel de cada repositório.

### 1. Introdução e objetivos

O **Praticom** é um ERP de gestão condominial. Esta entrega publica na nuvem Azure dois módulos dele, reaproveitando telas e regras do projeto original (`Richanhe/Praticom`):

- **Mercadinho autônomo**: cadastro de produtos, controle de estoque e PDV (caixa de autoatendimento do morador).
- **Financeiro**: lançamentos a pagar e a receber, baixa de pagamento, resumo e inadimplência por unidade.

Regra de negócio que liga os dois: **quando o morador paga uma compra do mercadinho com débito na cota condominial, o Financeiro cria automaticamente uma receita pendente para a unidade, com vencimento em 30 dias.** Essa comunicação acontece por mensagem no **Azure Service Bus**.

| Objetivo de qualidade | Como é atendido |
|---|---|
| Independência entre módulos | Um microsserviço e um microfrontend por domínio, cada serviço com o próprio banco |
| Manutenibilidade | Arquitetura hexagonal com regras de dependência verificadas por testes de arquitetura |
| Segurança | Entrada única pelo Gateway (CORS, Helmet, rate limit) e chave interna entre Gateway e serviços |
| Resiliência | Mensageria assíncrona, eventos idempotentes, dead-letter e degradação parcial no BFF |

**Partes interessadas:** síndico/administradora (financeiro), moradores (compras no PDV), equipe de desenvolvimento e professor avaliador.

### 2. Restrições

- Nuvem **Azure**: Conta de Armazenamento com site estático (frontend; o Static Web Apps não está disponível nas regiões liberadas pela política da assinatura Azure for Students da PUCPR), Web App/App Service (Gateway e microsserviços), Azure SQL Database, Azure Service Bus; **MongoDB Atlas** (Free Tier) para o Mercadinho.
- Frontend em **React** com **Module Federation** (microfrontends).
- Três repositórios públicos: frontend, gateway e backend.
- O frontend só conversa com o Gateway/BFF, nunca com os microsserviços.
- Stack: Node.js 20 + Express nos backends (mesma do Praticom original); React 18 + Vite 5 no frontend.

### 3. Contexto e escopo

```mermaid
flowchart LR
  user([Morador / Síndico]) -->|HTTPS| front[Frontend<br/>Azure Storage - site estático]
  front -->|HTTPS + CORS| gw[API Gateway & BFF<br/>Azure Web App]
  gw -->|x-internal-key| market[Microsserviço Mercadinho<br/>Azure Web App]
  gw -->|x-internal-key| finance[Microsserviço Financeiro<br/>Azure Web App]
  market --> mongo[(MongoDB Atlas)]
  finance --> sqldb[(Azure SQL Database)]
  market -- publica evento --> bus{{Azure Service Bus<br/>fila market-sale-condo-bill}}
  bus -- consome evento --> finance
```

Fora do escopo: encomendas, portaria, reservas e comunicados do Praticom original. Unidades e moradores são **dados de referência fixos servidos pelo BFF**, porque o cadastro de pessoas é outro domínio, que não faz parte destes dois microsserviços.

### 4. Estratégia de solução

| Decisão | Motivo |
|---|---|
| **Arquitetura Hexagonal (Ports & Adapters)** nos microsserviços e no Gateway | Domínio sem dependência de banco, HTTP ou broker; adaptadores trocáveis (Mongo/SQL ↔ memória nos testes) |
| **Database per Service** | Mercadinho em MongoDB (documentos de produto/venda) e Financeiro em Azure SQL (dados contábeis relacionais) |
| **API Gateway + BFF** em um único projeto | Ponto único de entrada (roteamento, segurança, CORS, Swagger) e respostas agregadas para as telas |
| **Microfrontends com Module Federation** | Shell (host) + remote Mercadinho + remote Financeiro, carregados em tempo de execução |
| **Mensageria assíncrona** (Service Bus) | O Mercadinho não depende do Financeiro estar no ar para concluir uma venda |
| **Reaproveitamento** | Telas `MarketInventoryView` e `FinancialView` e regras dos DAOs do Praticom foram mantidas |

### 5. Visão de blocos de construção

**Nível 1: repositórios**

| Repositório | Conteúdo |
|---|---|
| `praticom-frontend` | `shell/` (host), `mfe-market/` (remote), `mfe-finance/` (remote), `shared/api.js` (cliente do BFF) |
| `praticom-gateway-bff` | Proxy/roteamento, agregações BFF, segurança, Swagger |
| `praticom-backend` | `market-service/` (MongoDB) e `finance-service/` (Azure SQL) |

**Nível 2: camadas hexagonais de cada microsserviço**

```mermaid
flowchart TB
  subgraph adapters_in[adapters/inbound]
    http[HTTP Express + Swagger]
    sbc[Consumidor Service Bus<br/>só no Financeiro]
  end
  subgraph app[application]
    svc[Serviços de caso de uso]
    ports[[Portas: Repository, EventPublisher]]
  end
  subgraph dom[domain]
    rules[Entidades e regras puras]
  end
  subgraph adapters_out[adapters/outbound]
    db[Mongo / Azure SQL]
    mem[Memória - testes e uso local]
    pub[Publicador Service Bus]
  end
  infra[infrastructure: config + composição]
  http --> svc
  sbc --> svc
  svc --> rules
  svc --> ports
  db -. implementa .-> ports
  mem -. implementa .-> ports
  pub -. implementa .-> ports
  infra --> http
  infra --> db
```

Regras garantidas pelos testes de arquitetura (`test/architecture.test.js`):
- `domain` não importa nenhuma outra camada nem pacote externo;
- `application` depende só de `domain`;
- adaptadores de entrada não conhecem adaptadores de saída (e vice-versa).

| Microsserviço | Responsabilidade | Endpoints (sem o prefixo do gateway) |
|---|---|---|
| Mercadinho | Produtos, estoque, PDV e vendas | `GET/POST /products`, `GET/PATCH/DELETE /products/{id}`, `PATCH /products/{id}/stock`, `POST /checkout`, `GET /sales` |
| Financeiro | Lançamentos, baixa, resumo e inadimplência | `GET/POST /transactions`, `GET/PATCH/DELETE /transactions/{id}`, `PATCH /transactions/{id}/pay`, `GET /summary` |

**Gateway/BFF**

| Rota pública | Tipo | Destino |
|---|---|---|
| `/api/market/*` | Proxy (roteamento) | Microsserviço Mercadinho |
| `/api/financial/*` | Proxy + enriquecimento (bloco/apto) | Microsserviço Financeiro |
| `/api/bff/dashboard` | **Agregação** | Mercadinho + Financeiro em uma única resposta |
| `/api/bff/sales` (= `/api/market/sales`) | **Composição** | Venda (Mongo) + lançamento gerado (Azure SQL) + unidade/morador |
| `/api/bff/status` | Saúde | Estado dos dois microsserviços |
| `/api/units`, `/api/residents` | Referência | Dados fixos do BFF |
| `/docs` | Swagger | Documentação OpenAPI |

**Microfrontends**

| App | Tipo | Expõe/consome | Publicado em |
|---|---|---|---|
| `shell` | Host | Menu, tema, notificações e a **Visão geral** (usa `/api/bff/dashboard`) | `/` |
| `mfe-market` | Remote | Expõe `./MarketApp` (tela de Mercadinho e PDV) | `/market/assets/remoteEntry.js` |
| `mfe-finance` | Remote | Expõe `./FinanceApp` (tela Financeiro) | `/finance/assets/remoteEntry.js` |

### 6. Visão de execução

**Compra no PDV debitada na cota condominial**

```mermaid
sequenceDiagram
  actor M as Morador
  participant F as Frontend (remote Mercadinho)
  participant G as Gateway/BFF
  participant MS as Mercadinho
  participant DB1 as MongoDB Atlas
  participant SB as Azure Service Bus
  participant FS as Financeiro
  participant DB2 as Azure SQL
  M->>F: Finaliza compra (cota condominial)
  F->>G: POST /api/market/checkout
  G->>MS: POST /checkout (x-internal-key)
  MS->>DB1: baixa estoque (atômica) e grava venda
  MS->>SB: publica market.sale.condo_bill
  MS-->>G: 201 venda (event_status = SENT)
  G-->>F: 201
  SB-->>FS: entrega mensagem
  FS->>DB2: INSERT receita pendente (source_ref = market-sale-{id})
  F->>G: GET /api/bff/dashboard
  G->>MS: GET /products e /sales
  G->>FS: GET /summary e /transactions
  G-->>F: resposta única agregada
```

Contrato da mensagem:

```json
{ "eventId": "uuid", "type": "market.sale.condo_bill", "saleId": 12, "unitId": 2, "residentId": 2, "amount": 16.9, "occurredAt": "2026-11-05T21:00:00.000Z" }
```

**CRUD de lançamento:** `Frontend → POST/PATCH/DELETE /api/financial/transactions → Gateway → Financeiro → Azure SQL`.

### 7. Visão de implantação

```mermaid
flowchart LR
  subgraph GitHub
    r1[praticom-frontend] -->|Actions| swa
    r2[praticom-gateway-bff] -->|Actions| wa1
    r3[praticom-backend] -->|Actions| wa2
    r3 -->|Actions| wa3
  end
  subgraph Azure
    swa[Storage Account - site estático<br/>shell + /market + /finance]
    wa1[Web App<br/>gateway-bff]
    wa2[Web App<br/>market-service]
    wa3[Web App<br/>finance-service]
    sql[(Azure SQL Database)]
    bus{{Service Bus - fila}}
  end
  atlas[(MongoDB Atlas M0)]
  wa2 --> atlas
  wa3 --> sql
  wa2 --> bus --> wa3
  swa --> wa1 --> wa2
  wa1 --> wa3
```

| Componente | Serviço Azure | Variáveis principais |
|---|---|---|
| Frontend | Conta de Armazenamento (site estático `$web`) | `VITE_API_URL` (no build) |
| Gateway/BFF | Web App Node 20 (Linux) | `MARKET_SERVICE_URL`, `FINANCE_SERVICE_URL`, `INTERNAL_API_KEY`, `CORS_ORIGINS` |
| Mercadinho | Web App Node 20 (Linux) | `MONGODB_URI`, `MONGODB_DB`, `SERVICEBUS_CONNECTION_STRING`, `SERVICEBUS_QUEUE`, `INTERNAL_API_KEY` |
| Financeiro | Web App Node 20 (Linux) | `SQL_CONNECTION_STRING`, `SERVICEBUS_CONNECTION_STRING`, `SERVICEBUS_QUEUE`, `INTERNAL_API_KEY` |

### 8. Conceitos transversais

- **Segurança:** CORS com lista de origens, Helmet (cabeçalhos seguros), limite de requisições por minuto e JSON limitado a 100 kB no Gateway. Os microsserviços exigem o header `x-internal-key`, que só o Gateway conhece. Consultas SQL são sempre parametrizadas.
- **CORS:** centralizado no Gateway; os microsserviços não são chamados pelo navegador.
- **Rastreabilidade:** o Gateway gera/propaga `X-Correlation-Id` e devolve `X-Gateway-Processed-By` e `X-Gateway-Execution-Time-Ms`.
- **Erros:** regras de negócio violadas viram HTTP 400, recurso inexistente vira 404, serviço fora do ar vira 502/504 no Gateway. Mensagens em português, exibidas pelas telas.
- **Mensageria confiável:** consumo com *peek-lock*; mensagem inválida vai para a *dead-letter queue*; erro técnico devolve a mensagem para nova tentativa; o Financeiro é **idempotente** (índice único em `source_ref`), então uma entrega repetida não duplica a cobrança.
- **Consistência no Mercadinho:** baixa de estoque atômica no Mongo (`$inc` com filtro de estoque suficiente) e compensação (devolução do estoque) se algum item do carrinho falhar.
- **Status calculado:** um lançamento pendente com vencimento anterior a hoje é exibido como `OVERDUE`, no fuso `America/Sao_Paulo`.
- **SOLID:** responsabilidade única por camada e serviço; inversão de dependência pelas portas (`ProductRepository`, `SaleRepository`, `EventPublisher`, `TransactionRepository`, `ServiceClientPort`); adaptadores substituíveis sem mudar o domínio (aberto/fechado e substituição de Liskov nos repositórios em memória × banco).
- **Testes:** `node --test` em todos os projetos: unitários (domínio, serviços, HTTP) e de arquitetura.

### 9. Decisões de arquitetura

| # | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| D1 | Partir do Praticom e quebrar em serviços | Projeto novo do zero | Prazo curto; telas e regras já existiam |
| D2 | Mercadinho + Financeiro como domínios | Reservas + Financeiro | Menos dependências entre tabelas no código original; o débito em cota já era regra existente |
| D3 | Hexagonal | Clean/Onion | Separação clara entre portas e adaptadores; fácil testar com adaptadores em memória |
| D4 | Fila do Service Bus (não tópico) | Chamada HTTP síncrona | Desacopla a venda da disponibilidade do Financeiro |
| D5 | Remotes publicados no mesmo site estático | Um site por remote | Um único deploy e sem CORS para o `remoteEntry.js` |
| D6 | Unidades/moradores fixos no BFF | Terceiro microsserviço | Fora do escopo exigido; mantém as telas originais funcionando |

### 10. Requisitos de qualidade

| Cenário | Resposta esperada |
|---|---|
| Financeiro fora do ar durante uma compra na cota | A venda é concluída; a mensagem fica na fila e é processada quando o serviço voltar |
| Mesma mensagem entregue duas vezes | Apenas um lançamento é criado |
| Mercadinho fora do ar ao abrir a Visão geral | O BFF devolve os dados do Financeiro e um aviso em `warnings` |
| Chamada direta a um microsserviço sem a chave | HTTP 401 |
| Site de outra origem chamando o Gateway | Bloqueado pelo CORS |
| Remote não carrega | Só a área dele mostra erro; o shell continua funcionando |

### 11. Riscos e débitos técnicos

- Plano gratuito (F1) do App Service hiberna sem uso: a primeira chamada após um tempo parado demora, e o consumidor do Service Bus só processa mensagens quando o Financeiro está acordado (as mensagens não se perdem).
- Unidades e moradores são fixos no BFF; um cadastro real exigiria um terceiro serviço.
- Não há autenticação de usuário final (login); a proteção é de perímetro (Gateway) e entre serviços (chave interna).
- Se o Service Bus falhar no momento da venda, ela fica com `event_status = PENDING` e não há reenvio automático.

### 12. Glossário

| Termo | Significado |
|---|---|
| BFF | *Backend for Frontend*: camada que agrega e adapta dados para as telas |
| Gateway | Ponto único de entrada que roteia, protege e documenta as APIs |
| Microfrontend | Parte da interface construída e publicada de forma independente |
| Module Federation | Recurso que permite a um app (host) carregar módulos de outro app (remote) em tempo de execução |
| Remote / Host | App que expõe módulos / app que os consome |
| Cota condominial | Taxa mensal cobrada de cada unidade |
| Dead-letter | Fila para mensagens que não podem ser processadas |
| Idempotência | Repetir a mesma operação não altera o resultado |
| PDV | Ponto de venda (caixa de autoatendimento do mercadinho) |

