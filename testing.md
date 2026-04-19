# TESTING.md — Estratégia de Testes

> Referência completa de testes do projeto Chat Realtime.

---

## Filosofia

- **TDD estrito** — nenhuma linha de código é escrita antes do teste
- **Ciclo:** Red → Green → Refactor
- **Spec driven** — toda feature começa com uma spec
- **Ao menos 1 teste por feature**

---

## Ciclo TDD na prática

```
1. RED     — escreve o teste que falha (feature não existe ainda)
2. GREEN   — escreve o mínimo de código para o teste passar
3. REFACTOR — melhora o código sem quebrar o teste
```

Nunca pule o RED. Se o teste passar sem você escrever código, a spec está errada.

---

## Framework e ferramentas

| Ferramenta | Uso |
|------------|-----|
| `jest` | Runner, assertions, coverage |
| `jest.mock()` | Mocka módulos inteiros |
| `jest.fn()` | Cria funções mock |
| `jest.spyOn()` | Espia métodos existentes |
| `socket.io-client` | Testa eventos Socket.io em memória |

---

## Estrutura de arquivos

```
tests/
├── unit/
│   ├── models/
│   │   ├── user.test.js
│   │   ├── room.test.js
│   │   └── message.test.js
│   ├── kafka/
│   │   ├── producer.test.js
│   │   └── consumer.test.js
│   └── middlewares/
│       ├── auth.test.js
│       └── circuitBreaker.test.js
├── integration/
│   ├── routes/
│   │   ├── auth.test.js
│   │   └── rooms.test.js
│   ├── socket/
│   │   └── chat.test.js
│   └── kafka/
│       └── messaging.test.js
└── e2e/                        # apenas em homol
    └── chat.test.js
```

---

## Nomenclatura

Padrão BDD com `describe` e `it`, sempre começando com "deve":

```javascript
describe('quando o usuário envia uma mensagem', () => {
  it('deve publicar no Kafka', async () => { ... })
  it('deve salvar no MySQL', async () => { ... })
  it('deve fazer broadcast via Socket.io', async () => { ... })
})
```

Leitura natural: *"quando X, deve Y"*

---

## Ambientes

| Ambiente | Banco | Kafka | Socket.io | Redis |
|----------|-------|-------|-----------|-------|
| **Dev** | Real (`chat_dev`) | Mock | Em memória | Mock |
| **Homol** | Real (`chat_homol`) | Docker | Em memória | Docker |
| **Prod** | — | — | — | — |

---

## Socket.io — estratégia

Socket.io é testado com `socket.io-client` em memória — o servidor sobe dentro do próprio teste, sem depender de rede.

```javascript
import { createServer } from 'http'
import { Server } from 'socket.io'
import { io as Client } from 'socket.io-client'

describe('quando o usuário entra na sala', () => {
  let server, ioServer, clientSocket

  beforeAll((done) => {
    const httpServer = createServer()
    ioServer = new Server(httpServer)
    httpServer.listen(() => {
      const port = httpServer.address().port
      clientSocket = new Client(`http://localhost:${port}`)
      ioServer.on('connection', (socket) => { /* handlers */ })
      clientSocket.on('connect', done)
    })
  })

  afterAll(() => {
    ioServer.close()
    clientSocket.disconnect()
  })

  it('deve receber o histórico de mensagens', (done) => {
    clientSocket.emit('join:room', { roomId: 'sala-1' })
    clientSocket.on('room:history', (messages) => {
      expect(messages).toBeDefined()
      done()
    })
  })
})
```

**Chamadas batch** — múltiplos eventos em sequência:

```javascript
it('deve fazer broadcast para todos na sala', (done) => {
  const client2 = new Client(url)
  client2.on('message:received', (msg) => {
    expect(msg.content).toBe('olá')
    client2.disconnect()
    done()
  })
  clientSocket.emit('message:send', { roomId: 'sala-1', content: 'olá' })
})
```

---

## Kafka — estratégia e pontos de atenção

Kafka é o componente de **maior complexidade** nos testes devido a:

- **Latência não determinística** — mensagem pode demorar ms ou segundos para ser consumida
- **Consumer group rebalancing** — redistribuição de partições causa delay
- **Offset management** — mensagem pode ser reprocessada se consumer cair durante teste
- **Simulação de falha** — necessário para testar circuit breaker

### Em dev — mock completo

```javascript
// src/kafka/producer.js é mockado inteiro
jest.mock('../../src/kafka/producer')
import { publishMessage } from '../../src/kafka/producer'

it('deve publicar mensagem no Kafka', async () => {
  publishMessage.mockResolvedValue({ success: true })
  const result = await sendMessage({ content: 'olá', roomId: 'sala-1' })
  expect(publishMessage).toHaveBeenCalledWith({
    topic: 'messages',
    content: 'olá',
    roomId: 'sala-1'
  })
})
```

### Simulando falha para circuit breaker

```javascript
it('deve enfileirar no Redis quando Kafka falha', async () => {
  publishMessage.mockRejectedValue(new Error('Kafka unavailable'))
  const enqueueRedis = jest.fn()

  await sendMessage({ content: 'olá', roomId: 'sala-1' })

  expect(enqueueRedis).toHaveBeenCalled()
})
```

### Em homol — Docker real
Os testes e2e sobem o Kafka via docker-compose e usam `kafkajs` diretamente. Timeouts devem ser generosos (`jest.setTimeout(30000)`).

---

## Circuit breaker — estratégia

```javascript
describe('circuit breaker', () => {
  it('deve abrir após 3 falhas consecutivas', async () => { ... })
  it('deve delegar para Redis quando aberto', async () => { ... })
  it('deve fechar após Kafka voltar', async () => { ... })
})
```

---

## Coverage mínimo

Toda feature deve ter ao menos 1 teste. Rodar coverage com:

```bash
npx jest --coverage
```

Configuração no `jest.config.js`:

```javascript
module.exports = {
  coverageThreshold: {
    global: {
      functions: 80,
      lines: 80
    }
  }
}
```
