import { jest } from '@jest/globals'
import CircuitBreaker from 'opossum'

// ── Mocks ─────────────────────────────────────────────────────
const mockProducerSend = jest.fn()
const mockUpdateStatus = jest.fn()
const mockRedisRpush   = jest.fn()

jest.unstable_mockModule('../../src/config/kafka.js', () => ({
  createProducer: jest.fn(() => ({
    connect:    jest.fn(),
    disconnect: jest.fn(),
    send:       mockProducerSend
  })),
  createConsumer: jest.fn(() => ({
    connect:    jest.fn(),
    disconnect: jest.fn(),
    subscribe:  jest.fn(),
    run:        jest.fn()
  }))
}))

jest.unstable_mockModule('../../src/models/message.js', () => ({
  create:       jest.fn(),
  updateStatus: mockUpdateStatus,
  findById:     jest.fn()
}))

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  connectRedis: jest.fn().mockResolvedValue(),
  default: {
    rpush:    mockRedisRpush,
    get:      jest.fn().mockResolvedValue('0'),
    set:      jest.fn(),
    incr:     jest.fn(),
    expire:   jest.fn(),
    del:      jest.fn(),
    sadd:     jest.fn(),
    srem:     jest.fn(),
    smembers: jest.fn()
  }
}))

jest.unstable_mockModule('../../src/socket/index.js', () => ({
  broadcastToRoom: jest.fn()
}))

jest.unstable_mockModule('../../src/middlewares/auth.js', () => ({
  authenticate: jest.fn((req, res, next) => next())
}))

// ── Setup ─────────────────────────────────────────────────────
let publishMessage, getKafkaBreaker, resetKafkaBreaker

beforeAll(async () => {
  const producer = await import('../../src/kafka/producer.js')
  const cb       = await import('../../src/middlewares/circuitBreaker.js')
  publishMessage     = producer.publishMessage
  getKafkaBreaker    = cb.getKafkaBreaker
  resetKafkaBreaker  = cb.resetKafkaBreaker
})

// ── opossum — comportamento base ──────────────────────────────
describe('CircuitBreaker', () => {
  it('deve executar a função com sucesso quando não há falha', async () => {
    const fn      = jest.fn().mockResolvedValue('ok')
    const breaker = new CircuitBreaker(fn, { errorThresholdPercentage: 50, resetTimeout: 100 })
    const result  = await breaker.fire()
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalled()
    expect(breaker.opened).toBe(false)
  })

  it('deve abrir o circuito após falhas consecutivas', async () => {
    const fn      = jest.fn().mockRejectedValue(new Error('fail'))
    const breaker = new CircuitBreaker(fn, { errorThresholdPercentage: 50, resetTimeout: 100 })
    await expect(breaker.fire()).rejects.toThrow('fail')
    await expect(breaker.fire()).rejects.toThrow('Breaker is open')
    expect(breaker.opened).toBe(true)
  })

  it('deve chamar o fallback quando definido', async () => {
    const fn       = jest.fn().mockRejectedValue(new Error('fail'))
    const fallback = jest.fn().mockResolvedValue('fallback')
    const breaker  = new CircuitBreaker(fn, { errorThresholdPercentage: 50, resetTimeout: 100 })
    breaker.fallback(fallback)
    await expect(breaker.fire()).resolves.toBe('fallback')
    expect(fallback).toHaveBeenCalled()
  })
})

// ── kafkaBreaker — integração ─────────────────────────────────
describe('kafkaBreaker — integração com producer', () => {
  let kafkaBreaker

  beforeEach(async () => {
    jest.clearAllMocks()
    resetKafkaBreaker()
    kafkaBreaker = await getKafkaBreaker()
    kafkaBreaker.close()
  })

  it('deve estar fechado inicialmente', () => {
    expect(kafkaBreaker.opened).toBe(false)
  })

  it('deve publicar normalmente quando Kafka está disponível', async () => {
    mockProducerSend.mockResolvedValue()
    mockUpdateStatus.mockResolvedValue()

    await publishMessage({ id: 'msg-1', roomId: 'room-1', userId: 'user-1', content: 'olá' })

    expect(mockProducerSend).toHaveBeenCalled()
    expect(mockRedisRpush).not.toHaveBeenCalled()
  })

  it('deve usar fallback Redis quando Kafka falha', async () => {
    mockProducerSend.mockRejectedValue(new Error('Kafka unavailable'))
    mockRedisRpush.mockResolvedValue(1)

    await publishMessage({ id: 'msg-1', roomId: 'room-1', userId: 'user-1', content: 'olá' })

    expect(mockRedisRpush).toHaveBeenCalledWith(
      'kafka:fallback:messages',
      expect.any(String)
    )
  })

  it('deve emitir evento "open" ao abrir o circuito', async () => {
    const onOpen = jest.fn()
    kafkaBreaker.on('open', onOpen)
    mockProducerSend.mockRejectedValue(new Error('Kafka unavailable'))

    for (let i = 0; i < 5; i++) {
      await publishMessage({ id: `msg-${i}`, roomId: 'room-1', userId: 'user-1', content: 'olá' })
    }

    expect(onOpen).toHaveBeenCalled()
    kafkaBreaker.removeListener('open', onOpen)
  })

  it('deve emitir evento "close" ao fechar o circuito', async () => {
    const onClose = jest.fn()
    kafkaBreaker.on('close', onClose)

    kafkaBreaker.open()
    kafkaBreaker.close()

    expect(onClose).toHaveBeenCalled()
    kafkaBreaker.removeListener('close', onClose)
  })
})
