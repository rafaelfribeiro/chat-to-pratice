import { jest } from '@jest/globals'
import { createServer } from 'http'

// ── Mocks ─────────────────────────────────────────────────────
const mockFindMember  = jest.fn()
const mockAddMember   = jest.fn()
const mockFindByRoom  = jest.fn()
const mockCreate      = jest.fn()
const mockUpdateStatus = jest.fn()
const mockPublish     = jest.fn()

const mockRedisSet    = jest.fn()
const mockRedisGet    = jest.fn()
const mockRedisSadd   = jest.fn()
const mockRedisSrem   = jest.fn()
const mockRedisSmembers = jest.fn()

jest.unstable_mockModule('../../src/models/roomMember.js', () => ({
  findMember: mockFindMember,
  addMember:  mockAddMember
}))

jest.unstable_mockModule('../../src/models/message.js', () => ({
  findByRoom:   mockFindByRoom,
  create:       mockCreate,
  updateStatus: mockUpdateStatus
}))

jest.unstable_mockModule('../../src/kafka/producer.js', () => ({
  publishMessage:   mockPublish,
  connectProducer:  jest.fn(),
  disconnectProducer: jest.fn()
}))

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  connectRedis: jest.fn().mockResolvedValue(),
  default: {
    set:      mockRedisSet,
    get:      mockRedisGet,
    sadd:     mockRedisSadd,
    srem:     mockRedisSrem,
    smembers: mockRedisSmembers,
    incr:     jest.fn(),
    expire:   jest.fn(),
    del:      jest.fn(),
    rpush:    jest.fn()
  }
}))

jest.unstable_mockModule('../../src/config/jwt.js', () => ({
  verifyAccessToken: jest.fn().mockReturnValue({ id: 'user-1', name: 'João' }),
  signAccessToken:   jest.fn(),
  signRefreshToken:  jest.fn(),
  verifyRefreshToken: jest.fn(),
  cookieOptions:     {}
}))

// ── Setup ─────────────────────────────────────────────────────
let io, clientSocket, httpServer

beforeAll(async () => {
  const { initSocket } = await import('../../src/socket/index.js')
  const { setupHandlers } = await import('../../src/socket/handlers.js')

  httpServer = createServer()
  io = initSocket(httpServer)
  setupHandlers(io)

  await new Promise(resolve => httpServer.listen(0, resolve))
})

afterAll(async () => {
  if (clientSocket?.connected) clientSocket.disconnect()
  await new Promise(resolve => io.close(resolve))
  await new Promise(resolve => httpServer.close(resolve))
})

const { io: Client } = await import('socket.io-client')

const connect = (cookie = 'access_token=valid') =>
  new Promise((resolve, reject) => {
    const port = httpServer.address().port
    const s = Client(`http://localhost:${port}`, {
      extraHeaders: { cookie }
    })
    s.on('connect', () => resolve(s))
    s.on('connect_error', reject)
  })

// ── Autenticação ──────────────────────────────────────────────
describe('autenticação do socket', () => {
  it('deve conectar com JWT válido', async () => {
    const s = await connect()
    expect(s.connected).toBe(true)
    s.disconnect()
  })

  it('deve rejeitar conexão sem token', async () => {
    await expect(connect('')).rejects.toBeDefined()
  })
})

// ── join:room ─────────────────────────────────────────────────
describe('evento join:room', () => {
  let s
  beforeEach(async () => { s = await connect() })
  afterEach(() => s.disconnect())

  it('deve carregar histórico para membro antigo', async () => {
    mockFindMember.mockResolvedValue({ joined_at: new Date() })
    mockFindByRoom.mockResolvedValue([{ id: 'msg-1', content: 'oi' }])
    mockRedisSadd.mockResolvedValue(1)
    mockRedisSmembers.mockResolvedValue(['user-1'])

    const history = await new Promise(resolve => {
      s.on('room:history', resolve)
      s.emit('join:room', { roomId: 'room-1' })
    })

    expect(history).toEqual([{ id: 'msg-1', content: 'oi' }])
  })

  it('deve entrar zerado para membro novo', async () => {
    mockFindMember.mockResolvedValue({ joined_at: new Date() })
    mockFindByRoom.mockResolvedValue([])
    mockRedisSadd.mockResolvedValue(1)
    mockRedisSmembers.mockResolvedValue(['user-1', 'user-2'])

    // s2 entra na sala primeiro como membro antigo
    const s2 = await connect()
    await new Promise(resolve => {
      s2.on('room:history', resolve)
      s2.emit('join:room', { roomId: 'room-novo' })
    })

    // agora s entra como membro novo — s2 deve receber user:joined
    mockFindMember.mockResolvedValue(null)
    mockAddMember.mockResolvedValue()

    const joined = await new Promise(resolve => {
      s2.on('user:joined', resolve)
      s.emit('join:room', { roomId: 'room-novo' })
    })

    expect(joined).toHaveProperty('userId', 'user-1')
    // findByRoom só foi chamado para s2 (membro antigo), não para s (membro novo)
    expect(mockAddMember).toHaveBeenCalledWith('room-novo', 'user-1')
    s2.disconnect()
  })

  it('deve emitir room:presence ao entrar', async () => {
    mockFindMember.mockResolvedValue({ joined_at: new Date() })
    mockFindByRoom.mockResolvedValue([])
    mockRedisSadd.mockResolvedValue(1)
    mockRedisSmembers.mockResolvedValue(['user-1', 'user-2'])

    const presence = await new Promise(resolve => {
      s.on('room:presence', resolve)
      s.emit('join:room', { roomId: 'room-1' })
    })

    expect(presence).toContain('user-1')
  })
})

// ── message:send ──────────────────────────────────────────────
describe('evento message:send', () => {
  let s
  beforeEach(async () => { s = await connect() })
  afterEach(() => s.disconnect())

  it('deve publicar mensagem no Kafka', async () => {
    mockCreate.mockResolvedValue({ id: 'msg-1', content: 'olá', roomId: 'room-1', userId: 'user-1' })
    mockPublish.mockResolvedValue()

    s.emit('message:send', { roomId: 'room-1', content: 'olá' })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({
      roomId:  'room-1',
      content: 'olá'
    }))
  })
})

// ── leave:room ────────────────────────────────────────────────
describe('evento leave:room', () => {
  let s
  beforeEach(async () => { s = await connect() })
  afterEach(() => s.disconnect())

  it('deve remover usuário da presença ao sair', async () => {
    mockRedisSrem.mockResolvedValue(1)
    mockRedisSmembers.mockResolvedValue([])

    s.emit('leave:room', { roomId: 'room-1' })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockRedisSrem).toHaveBeenCalledWith('presence:room:room-1', 'user-1')
  })
})

// ── message:read ──────────────────────────────────────────────
describe('evento message:read', () => {
  let s
  beforeEach(async () => { s = await connect() })
  afterEach(() => s.disconnect())

  it('deve atualizar status para "read"', async () => {
    mockUpdateStatus.mockResolvedValue()

    s.emit('message:read', { messageId: 'msg-1' })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(mockUpdateStatus).toHaveBeenCalledWith('msg-1', 'read')
  })
})
