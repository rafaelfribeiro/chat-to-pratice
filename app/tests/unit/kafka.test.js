import { jest } from '@jest/globals'

// ── Mocks ─────────────────────────────────────────────────────
const mockProducerSend    = jest.fn()
const mockConsumerRun     = jest.fn()
const mockConsumerSubscribe = jest.fn()
const mockConnect         = jest.fn()
const mockDisconnect      = jest.fn()

const mockUpdateStatus    = jest.fn()
const mockFindById        = jest.fn()

const mockRedisRpush      = jest.fn()
const mockRedisLrange     = jest.fn()
const mockRedisLtrim      = jest.fn()

const mockBroadcast       = jest.fn()

jest.unstable_mockModule('../../src/config/kafka.js', () => ({
  createProducer: jest.fn(() => ({
    connect:    mockConnect,
    disconnect: mockDisconnect,
    send:       mockProducerSend
  })),
  createConsumer: jest.fn(() => ({
    connect:    mockConnect,
    disconnect: mockDisconnect,
    subscribe:  mockConsumerSubscribe,
    run:        mockConsumerRun
  }))
}))

jest.unstable_mockModule('../../src/models/message.js', () => ({
  create:       jest.fn().mockResolvedValue({ id: 'msg-1', status: 'pending' }),
  updateStatus: mockUpdateStatus,
  findById:     mockFindById
}))

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  connectRedis: jest.fn().mockResolvedValue(),
  default: {
    rpush:  mockRedisRpush,
    lrange: mockRedisLrange,
    ltrim:  mockRedisLtrim,
    get:    jest.fn().mockResolvedValue('0'),
    set:    jest.fn(),
    incr:   jest.fn(),
    expire: jest.fn(),
    del:    jest.fn()
  }
}))

jest.unstable_mockModule('../../src/socket/index.js', () => ({
  broadcastToRoom: mockBroadcast
}))

// ── Setup ─────────────────────────────────────────────────────
let producer, consumer

beforeAll(async () => {
  const p = await import('../../src/kafka/producer.js')
  const c = await import('../../src/kafka/consumer.js')
  producer = p
  consumer = c
})

// ── Producer ──────────────────────────────────────────────────
describe('Kafka Producer', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve publicar mensagem no tópico "messages"', async () => {
    mockProducerSend.mockResolvedValue()

    await producer.publishMessage({
      id:      'msg-1',
      roomId:  'room-1',
      userId:  'user-1',
      content: 'olá'
    })

    expect(mockProducerSend).toHaveBeenCalledWith({
      topic:    'messages',
      messages: [expect.objectContaining({
        key:   'room-1',
        value: expect.any(String)
      })]
    })
  })

  it('deve enfileirar no Redis quando Kafka falha', async () => {
    mockProducerSend.mockRejectedValue(new Error('Kafka unavailable'))
    mockRedisRpush.mockResolvedValue(1)

    await producer.publishMessage({
      id:      'msg-1',
      roomId:  'room-1',
      userId:  'user-1',
      content: 'olá'
    })

    expect(mockRedisRpush).toHaveBeenCalledWith(
      'kafka:fallback:messages',
      expect.any(String)
    )
  })

  it('deve atualizar status para "sent" após publicar', async () => {
    mockProducerSend.mockResolvedValue()
    mockUpdateStatus.mockResolvedValue()

    await producer.publishMessage({
      id:      'msg-1',
      roomId:  'room-1',
      userId:  'user-1',
      content: 'olá'
    })

    expect(mockUpdateStatus).toHaveBeenCalledWith('msg-1', 'sent')
  })
})

// ── Consumer ──────────────────────────────────────────────────
describe('Kafka Consumer', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve subscrever no tópico "messages"', async () => {
    mockConsumerSubscribe.mockResolvedValue()
    mockConsumerRun.mockResolvedValue()

    await consumer.startConsumer()

    expect(mockConsumerSubscribe).toHaveBeenCalledWith({
      topic:     'messages',
      fromBeginning: false
    })
  })

  it('deve fazer broadcast para a sala ao consumir mensagem', async () => {
    const msg = { id: 'msg-1', roomId: 'room-1', userId: 'user-1', content: 'olá' }

    mockConsumerRun.mockImplementation(async ({ eachMessage }) => {
      await eachMessage({
        message: { value: Buffer.from(JSON.stringify(msg)) }
      })
    })
    mockConsumerSubscribe.mockResolvedValue()
    mockUpdateStatus.mockResolvedValue()
    mockBroadcast.mockResolvedValue()

    await consumer.startConsumer()

    expect(mockBroadcast).toHaveBeenCalledWith('room-1', msg)
  })

  it('deve atualizar status para "delivered" após broadcast', async () => {
    const msg = { id: 'msg-1', roomId: 'room-1', userId: 'user-1', content: 'olá' }

    mockConsumerRun.mockImplementation(async ({ eachMessage }) => {
      await eachMessage({
        message: { value: Buffer.from(JSON.stringify(msg)) }
      })
    })
    mockConsumerSubscribe.mockResolvedValue()
    mockUpdateStatus.mockResolvedValue()
    mockBroadcast.mockResolvedValue()

    await consumer.startConsumer()

    expect(mockUpdateStatus).toHaveBeenCalledWith('msg-1', 'delivered')
  })
})

// ── QoS — status "read" ───────────────────────────────────────
describe('QoS — status read', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve atualizar status para "read" quando usuário visualizar', async () => {
    mockUpdateStatus.mockResolvedValue()

    const { markAsRead } = await import('../../src/kafka/consumer.js')
    await markAsRead('msg-1')

    expect(mockUpdateStatus).toHaveBeenCalledWith('msg-1', 'read')
  })
})
