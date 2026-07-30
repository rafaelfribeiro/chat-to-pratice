import { Kafka } from 'kafkajs'
import dotenv from 'dotenv'

dotenv.config()

const kafka = new Kafka({
  clientId: 'chat-realtime',
  brokers:  process.env.KAFKA_BROKERS?.split(',') ?? ['kafka-1:29092']
})

export const createProducer = () => kafka.producer()
export const createConsumer = (groupId = 'chat-group') => kafka.consumer({ groupId })
