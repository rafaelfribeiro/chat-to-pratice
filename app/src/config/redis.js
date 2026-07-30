import { createClient } from 'redis'
import dotenv from 'dotenv'

dotenv.config()

const client = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
})

client.on('error', (err) => console.error('Redis error:', err))

export const connectRedis = async () => {
  if (!client.isOpen) await client.connect()
}

export default client
