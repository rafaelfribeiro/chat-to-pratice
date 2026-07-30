import { verifyAccessToken } from '../config/jwt.js'
import { findMember, addMember } from '../models/roomMember.js'
import { findByRoom, create, updateStatus } from '../models/message.js'
import { publishMessage } from '../kafka/producer.js'
import redis from '../config/redis.js'

const presenceKey = (roomId) => `presence:room:${roomId}`

const authMiddleware = (socket, next) => {
  const cookie = socket.handshake.headers.cookie ?? ''
  const match  = cookie.match(/access_token=([^;]+)/)

  if (!match) return next(new Error('Não autenticado'))

  try {
    const payload = verifyAccessToken(match[1])
    socket.user = payload
    next()
  } catch {
    next(new Error('Token inválido'))
  }
}

export const setupHandlers = (io) => {
  io.use(authMiddleware)

  io.on('connection', (socket) => {
    const { id: userId, name } = socket.user

    // ── join:room ─────────────────────────────────────────────
    socket.on('join:room', async ({ roomId }) => {
      socket.join(roomId)

      const member = await findMember(roomId, userId)

      if (member) {
        const history = await findByRoom(roomId)
        socket.emit('room:history', history)
      } else {
        await addMember(roomId, userId)
        socket.to(roomId).emit('user:joined', { userId, name })
      }

      await redis.sadd(presenceKey(roomId), userId)
      const online = await redis.smembers(presenceKey(roomId))
      io.to(roomId).emit('room:presence', online)
    })

    // ── leave:room ────────────────────────────────────────────
    socket.on('leave:room', async ({ roomId }) => {
      socket.leave(roomId)
      await redis.srem(presenceKey(roomId), userId)
      const online = await redis.smembers(presenceKey(roomId))
      io.to(roomId).emit('room:presence', online)
      socket.to(roomId).emit('user:left', { userId, name })
    })

    // ── message:send ──────────────────────────────────────────
    socket.on('message:send', async ({ roomId, content }) => {
      const msg = await create({ roomId, userId, content })
      await publishMessage(msg)
    })

    // ── message:read ──────────────────────────────────────────
    socket.on('message:read', async ({ messageId }) => {
      await updateStatus(messageId, 'read')
    })

    // ── disconnect ────────────────────────────────────────────
    socket.on('disconnecting', async () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue
        await redis.srem(presenceKey(roomId), userId)
        const online = await redis.smembers(presenceKey(roomId))
        io.to(roomId).emit('room:presence', online)
        socket.to(roomId).emit('user:left', { userId, name })
      }
    })
  })
}
