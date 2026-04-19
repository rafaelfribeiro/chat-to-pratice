# Chat Realtime — Claude.md

> Documento de referência do projeto. Mantenha atualizado a cada decisão arquitetural relevante.

---

## O que é

Site de bate-papo em tempo real onde usuários fazem login com Google, buscam pessoas ou salas, e se comunicam via WebSocket.

---

## Arquitetura

### 5 serviços em containers Docker isolados

| Serviço | Responsabilidade |
|--------|-----------------|
| **Node.js** | Aplicação web (front + back), OAuth2 Google, Socket.io, Producer/Consumer Kafka, Circuit breaker |
| **MySQL** | Persistência — usuários, salas, mensagens |
| **Kafka** | Mensageria — 3 brokers, 3 partições por tópico, fator de replicação 3 |
| **Zookeeper** | Coordenação do cluster Kafka |
| **Redis** | Fila de fallback para mensagens quando Kafka está indisponível |

### Infraestrutura

- **Ambiente:** on-premise, servidor Ubuntu
- **Orquestração:** docker-compose
- **Rede:** interna (não exposta à internet)

---

## Funcionalidades

- Login via OAuth2 Google
- Busca de pessoas ou salas
- Chat 1:1 — sala privada criada automaticamente (`dm_userId1_userId2`)
- Chat em sala — múltiplos usuários
- Comunicação em tempo real via WebSocket (Socket.io)

---

## Fluxo principal

```
Login Google → OAuth2 → sessão Node
Usuário busca pessoa ou sala → MySQL
Entra na sala/conversa → Socket.io room
Envia mensagem → Producer → Kafka → Consumer → Socket.io broadcast
```

## Fluxo de fallback (fast delegate)

```
Kafka falha → circuit breaker abre
→ mensagem enfileirada no Redis (fila durável)
→ job periódico consome a fila e retenta no Kafka
→ Kafka volta → circuit breaker fecha → fluxo normal
→ usuário vê aviso leve "enviando..."
```

---

## Decisões técnicas

| Ponto | Decisão |
|-------|---------|
| **Kafka brokers** | 3 (tolerância a falha) |
| **Kafka partições** | 3 por tópico (uma por broker) |
| **Kafka replicação** | Fator 3, min ISR 2 |
| **Retenção de mensagens** | 30 dias no MySQL |
| **Circuit breaker** | `opossum` (Node.js) |
| **Fast delegate** | Fila Redis → retry periódico no Kafka |
| **Storage de arquivos** | Cloudflare R2 — URL pública gravada no banco (`photo VARCHAR(500)`) |
| **Auth do socket** | JWT em homologação → OAuth em produção |
| **JWT storage** | Cookie httpOnly + sameSite |
| **Access token** | Expiração 10min |
| **Refresh token** | Expiração 7 dias, guardado no MySQL (hash) |
| **Chat 1:1** | Sala privada automática |
| **Orquestração** | docker-compose |
| **Testes** | Jest — spec driven, TDD, ao menos 1 teste por feature |

---

## Ambientes

| Ambiente | Banco | Kafka | Auth |
|----------|-------|-------|------|
| **Dev** | Real (schema `chat_dev`) | Mock | Mock |
| **Homol** | Real (schema `chat_homol`) | Docker 3 brokers | JWT |
| **Prod** | Real (schema `chat_prod`) | Container on-premise 3 brokers | OAuth |

---

## CI/CD

- **CI:** GitHub Actions — roda testes automaticamente no push
- **Deploy:** automatizado via SSH (GitHub Actions → servidor on-premise)

```
Push main → GitHub Actions roda testes
Testes passam → SSH no servidor → git pull → docker compose up -d --build
```

- Secrets (DB, JWT, SSH) armazenados no GitHub Secrets

---

## Estratégia de testes

- **Framework:** Jest
- **Abordagem:** spec driven + TDD estrito (Red → Green → Refactor)
- **Regra:** nenhuma feature é escrita antes do teste
- **Mocks:** `jest.mock()`, `jest.fn()`, `jest.spyOn()`
- **Socket.io:** `socket.io-client` em memória, chamadas batch
- **Kafka:** mock em dev (alta complexidade), Docker em homol, container real em prod
- **Banco:** banco real em todos os ambientes (schema separado por ambiente)
- **Redis/outros:** mock em dev, Docker em homol
- **Nomenclatura:** BDD com `describe/it`, "deve" como padrão

### Estrutura

```
tests/
├── unit/         # funções puras, models, utils
├── integration/  # rotas, socket, kafka (mocks)
└── e2e/          # fluxo completo (homol)
```

### Atenção
- **Kafka** é o ponto de maior complexidade nos testes — latência não determinística, consumer group rebalancing, offset management e simulação de falha para circuit breaker
- Ver `TESTING.md` para detalhes completos

---

## Stack

```json
{
  "runtime": "Node.js",
  "framework": "Express",
  "realtime": "Socket.io",
  "mensageria": "Kafka (kafkajs)",
  "banco": "MySQL (mysql2)",
  "cache_fallback": "Redis (ioredis)",
  "storage": "Cloudflare R2 (@aws-sdk/client-s3)",
  "auth": "Passport.js + passport-google-oauth20",
  "circuitBreaker": "opossum",
  "testes": "Jest",
  "containers": "Docker + docker-compose",
  "ci": "GitHub Actions"
}
```

---

## Portas (dev/homol)

| Serviço | Porta externa |
|---------|--------------|
| Node.js | 3000 |
| MySQL | 3307 |
| Kafka broker 1 | 9092 |
| Kafka broker 2 | 9093 |
| Kafka broker 3 | 9094 |
| Redis | 6379 |
