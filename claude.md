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

- Login via OAuth2 Google ou email/senha
- Busca de pessoas ou salas
- Chat 1:1 — sala privada criada automaticamente (`dm_userId1_userId2`)
- Chat em sala — múltiplos usuários (máx 50)
- Comunicação em tempo real via WebSocket (Socket.io)

---

## Frontend

| Ponto | Decisão |
|-------|---------|
| **Tecnologia** | React + Tailwind CSS |
| **Build** | Vite — dev server em desenvolvimento (hot reload), build estático em prod servido pelo Node |
| **Dev proxy** | Vite proxy `/api` → `http://localhost:3000` para evitar CORS em dev |
| **Responsivo** | Mobile first |
| **Estilo** | Dark mode, gradientes nos avatares, tipografia espaçada (referência: Halcyon) |
| **Páginas** | Login, Register, Home (lista de conversas), Chat |
| **Futuro** | Chamada de voz e vídeo (fora do escopo atual) |

---

Todas protegidas pelo middleware `authenticate`.

```
── Salas ─────────────────────────────────────
GET  /rooms              — salas do usuário (scroll infinito, sem paginação fixa)
GET  /rooms/:id          — detalhes da sala
POST /rooms              — criar sala de grupo
POST /rooms/dm           — criar ou retomar DM (idempotente)
GET  /rooms/:id/members  — membros da sala

── Usuários ──────────────────────────────────
GET /users/search?q=     — buscar por nome ou email (todos os usuários)
GET /users/:id           — perfil do usuário
```

**Regras:**
- Salas são privadas — usuário só vê salas que participa
- DM: `POST /rooms/dm` verifica se já existe `dm_userId1_userId2` antes de criar

---

**Cliente → Servidor:**
```
join:room    — entrar na sala
leave:room   — sair da sala
message:send — enviar mensagem
message:read — marcar como lida
```

**Servidor → Cliente:**
```
room:history     — histórico (50 msgs) ao entrar, só para membros antigos
message:received — nova mensagem
user:joined      — alguém entrou
user:left        — alguém saiu
room:presence    — lista de usuários online na sala
error            — erro genérico
```

**Presença:** guardada no Redis (`presence:room:<roomId>` — Set de userIds)

**Histórico:** só carrega ao entrar se o usuário já era membro (`room_members.joined_at` existe)

---

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

## Fluxo de segurança — rate limit e reativação

```
Login com senha errada → incrementa contador no Redis (chave: login:attempts:<email>)
→ 5 tentativas → desativa conta → apaga refresh tokens → envia e-mail com link
→ usuário clica no link → GET /auth/reactivate?token=abc123
→ token válido → reativa conta → login automático → redireciona para home

Login com conta desativada:
→ verifica deactivated_at + 24h
→ passou 24h? → reativa automaticamente → deixa logar
→ não passou? → 403 + mensagem
```

---

## Decisões técnicas

| Ponto | Decisão |
|-------|---------|
| **Kafka brokers** | 3 (tolerância a falha) |
| **Kafka partições** | 3 por tópico (uma por broker) |
| **Kafka replicação** | Fator 3, min ISR 2 |
| **Retenção de mensagens** | 30 dias no MySQL |
| **Circuit breaker** | `opossum` (Node.js) — aplicado no Kafka producer |
| **CB timeout** | 3000ms |
| **CB errorThreshold** | 50% |
| **CB resetTimeout** | 30000ms |
| **CB fallback** | Enfileira no Redis (`kafka:fallback:messages`) |
| **Fast delegate** | Fila Redis → retry periódico no Kafka |
| **Auth do socket** | JWT em homologação → OAuth em produção |
| **Chat 1:1** | Sala privada automática |
| **Orquestração** | docker-compose |
| **Testes** | Jest — spec driven, TDD, ao menos 1 teste por feature |
| **JWT storage** | Cookie httpOnly + sameSite |
| **Access token** | Expiração 10min |
| **Refresh token** | Expiração 7 dias, guardado no MySQL (hash) |
| **Storage de arquivos** | Cloudflare R2 — URL pública gravada no banco (`photo VARCHAR(500)`) |
| **E-mail** | Nodemailer + Gmail SMTP (conta: claude.chat.env@gmail.com) |
| **Mailhog** | Dev/Homol — container local para captura de e-mails |
| **Rate limit login** | 5 tentativas, janela 1h, contador no Redis |
| **Bloqueio de conta** | Desativa após 5 tentativas, envia e-mail com link de reativação |
| **Reativação por link** | GET /auth/reactivate?token= → reativa → login automático → home |
| **Reativação automática** | Verifica deactivated_at + 24h no momento do login, sem job periódico |

---

## Ambientes

| Ambiente | Banco | Kafka | Auth | E-mail |
|----------|-------|-------|------|--------|
| **Dev** | Real (`chat_dev`) | Mock | Mock | Mailhog |
| **Homol** | Real (`chat_homol`) | Docker 3 brokers | JWT | Mailhog |
| **Prod** | Real (`chat_prod`) | Container on-premise 3 brokers | OAuth | Gmail SMTP |

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
  "email": "Nodemailer + Gmail SMTP",
  "frontend": "React + Tailwind CSS (Vite)",
  "testes": "Jest",
  "containers": "Docker + docker-compose",
  "ci": "GitHub Actions"
}
```

---

## Portas (dev/homol)

| Serviço | Porta externa |
|---------|--------------|
| Vite dev server | 5173 |
| Node.js | 3000 |
| MySQL | 3307 |
| Kafka broker 1 | 9092 |
| Kafka broker 2 | 9093 |
| Kafka broker 3 | 9094 |
| Redis | 6379 |
| Mailhog UI | 8025 |
| Mailhog SMTP | 1025 |
