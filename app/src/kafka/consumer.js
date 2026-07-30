import { createConsumer } from '../config/kafka.js'
import { updateStatus } from '../models/message.js'
import { broadcastToRoom } from '../socket/index.js'

const consumer = createConsumer()

export const startConsumer = async () => {
  await consumer.subscribe({ topic: 'messages', fromBeginning: false })
  await consumer.run({
    eachMessage: async ({ message }) => {
      const msg = JSON.parse(message.value.toString())
      await broadcastToRoom(msg.roomId, msg)
      await updateStatus(msg.id, 'delivered')
    }
  })
}

export const markAsRead = async (messageId) => {
  await updateStatus(messageId, 'read')
}

export const connectConsumer  = async () => consumer.connect()
export const disconnectConsumer = async () => consumer.disconnect()
