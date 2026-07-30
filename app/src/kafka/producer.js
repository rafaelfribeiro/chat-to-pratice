import { getKafkaBreaker } from '../middlewares/circuitBreaker.js'
import { updateStatus } from '../models/message.js'
import redis from '../config/redis.js'

export const publishMessage = async (msg) => {
  try {
    const breaker = await getKafkaBreaker()
    await breaker.fire(msg)
    await updateStatus(msg.id, 'sent')
  } catch {
    await redis.rpush('kafka:fallback:messages', JSON.stringify(msg))
  }
}

export const connectProducer    = async () => {}
export const disconnectProducer = async () => {}
