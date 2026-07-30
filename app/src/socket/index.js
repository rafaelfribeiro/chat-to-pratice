import { Server } from 'socket.io'

let io

export const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: '*' }
  })
  return io
}

export const broadcastToRoom = (roomId, msg) => {
  if (!io) return
  io.to(roomId).emit('message:received', msg)
}
