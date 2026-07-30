import CircuitBreaker from 'opossum'

const options = {
  timeout:                  3000,
  errorThresholdPercentage: 50,
  resetTimeout:             30000
}

export const createBreaker = (fn, fallbackFn) => {
  const breaker = new CircuitBreaker(fn, options)
  if (fallbackFn) breaker.fallback(fallbackFn)
  return breaker
}

// lazy singleton — inicializado na primeira chamada
let _kafkaBreaker = null

export const getKafkaBreaker = async () => {
  if (_kafkaBreaker) return _kafkaBreaker

  const { createProducer } = await import('../config/kafka.js')
  const { default: redis } = await import('../config/redis.js')

  const producer = createProducer()

  const send = async (msg) => {
    await producer.send({
      topic:    'messages',
      messages: [{ key: msg.roomId, value: JSON.stringify(msg) }]
    })
  }

  const fallback = async (msg) => {
    await redis.rpush('kafka:fallback:messages', JSON.stringify(msg))
  }

  _kafkaBreaker = new CircuitBreaker(send, options)
  _kafkaBreaker.fallback(fallback)

  return _kafkaBreaker
}

// para testes — permite resetar o singleton
export const resetKafkaBreaker = () => { _kafkaBreaker = null }
