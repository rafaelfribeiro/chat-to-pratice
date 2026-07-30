import { jest } from '@jest/globals'

// ── Mocks ─────────────────────────────────────────────────────
const mockFindRoomsByUser  = jest.fn()
const mockFindRoomById     = jest.fn()
const mockCreateRoom       = jest.fn()
const mockFindDM           = jest.fn()
const mockCreateDM         = jest.fn()
const mockFindMembers      = jest.fn()
const mockSearchUsers      = jest.fn()
const mockFindUserById     = jest.fn()

jest.unstable_mockModule('../../src/models/room.js', () => ({
  findByUser:  mockFindRoomsByUser,
  findById:    mockFindRoomById,
  create:      mockCreateRoom,
  findDM:      mockFindDM,
  createDM:    mockCreateDM
}))

jest.unstable_mockModule('../../src/models/roomMember.js', () => ({
  findMember:  jest.fn(),
  addMember:   jest.fn(),
  removeMember: jest.fn(),
  findByRoom:  mockFindMembers
}))

jest.unstable_mockModule('../../src/models/user.js', () => ({
  findByEmail:    jest.fn(),
  findById:       mockFindUserById,
  findByGoogleId: jest.fn(),
  create:         jest.fn(),
  deactivate:     jest.fn(),
  reactivate:     jest.fn(),
  search:         mockSearchUsers
}))

jest.unstable_mockModule('../../src/models/refreshToken.js', () => ({
  create:         jest.fn(),
  findByToken:    jest.fn(),
  deleteByToken:  jest.fn(),
  deleteByUserId: jest.fn(),
  deleteExpired:  jest.fn()
}))

jest.unstable_mockModule('../../src/models/accountReactivation.js', () => ({
  create:      jest.fn(),
  findByToken: jest.fn(),
  markUsed:    jest.fn()
}))

jest.unstable_mockModule('../../src/config/jwt.js', () => ({
  signAccessToken:    jest.fn(),
  signRefreshToken:   jest.fn(),
  verifyAccessToken:  jest.fn().mockReturnValue({ id: 'user-1', name: 'João' }),
  verifyRefreshToken: jest.fn(),
  cookieOptions:      {}
}))

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  connectRedis: jest.fn().mockResolvedValue(),
  default: {
    get:    jest.fn().mockResolvedValue('0'),
    set:    jest.fn(),
    incr:   jest.fn(),
    expire: jest.fn(),
    del:    jest.fn(),
    rpush:  jest.fn(),
    sadd:   jest.fn(),
    srem:   jest.fn(),
    smembers: jest.fn()
  }
}))

jest.unstable_mockModule('../../src/config/mailer.js', () => ({
  sendReactivationEmail: jest.fn()
}))

jest.unstable_mockModule('bcrypt', () => ({
  default: {
    compare: jest.fn(),
    hash:    jest.fn()
  }
}))

// ── Setup ─────────────────────────────────────────────────────
let app
beforeAll(async () => {
  const mod = await import('../../src/app.js')
  app = mod.default
})

afterAll(async () => {
  const { server } = await import('../../src/app.js')
  server.close()
})

import request from 'supertest'

const auth = { Cookie: 'access_token=valid' }

// ── GET /rooms ────────────────────────────────────────────────
describe('GET /rooms', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve retornar salas do usuário', async () => {
    mockFindRoomsByUser.mockResolvedValue([
      { id: 'room-1', name: 'Geral', type: 'group' }
    ])

    const res = await request(app).get('/rooms').set(auth)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(mockFindRoomsByUser).toHaveBeenCalledWith('user-1')
  })

  it('deve retornar 401 sem autenticação', async () => {
    const res = await request(app).get('/rooms')
    expect(res.status).toBe(401)
  })
})

// ── GET /rooms/:id ────────────────────────────────────────────
describe('GET /rooms/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve retornar detalhes da sala', async () => {
    mockFindRoomById.mockResolvedValue({ id: 'room-1', name: 'Geral', type: 'group' })

    const res = await request(app).get('/rooms/room-1').set(auth)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('id', 'room-1')
  })

  it('deve retornar 404 quando sala não existir', async () => {
    mockFindRoomById.mockResolvedValue(null)

    const res = await request(app).get('/rooms/nao-existe').set(auth)

    expect(res.status).toBe(404)
  })
})

// ── POST /rooms ───────────────────────────────────────────────
describe('POST /rooms', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve criar sala de grupo', async () => {
    mockCreateRoom.mockResolvedValue({ id: 'room-2', name: 'Dev', type: 'group' })

    const res = await request(app)
      .post('/rooms')
      .set(auth)
      .send({ name: 'Dev', description: 'Canal dev' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id', 'room-2')
    expect(mockCreateRoom).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Dev',
      createdBy: 'user-1'
    }))
  })

  it('deve retornar 400 quando faltar nome', async () => {
    const res = await request(app)
      .post('/rooms')
      .set(auth)
      .send({})

    expect(res.status).toBe(400)
  })
})

// ── POST /rooms/dm ────────────────────────────────────────────
describe('POST /rooms/dm', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve retornar DM existente', async () => {
    mockFindDM.mockResolvedValue({ id: 'dm-1', type: 'dm' })

    const res = await request(app)
      .post('/rooms/dm')
      .set(auth)
      .send({ targetUserId: 'user-2' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('id', 'dm-1')
    expect(mockCreateDM).not.toHaveBeenCalled()
  })

  it('deve criar novo DM quando não existir', async () => {
    mockFindDM.mockResolvedValue(null)
    mockCreateDM.mockResolvedValue({ id: 'dm-2', type: 'dm' })

    const res = await request(app)
      .post('/rooms/dm')
      .set(auth)
      .send({ targetUserId: 'user-2' })

    expect(res.status).toBe(201)
    expect(mockCreateDM).toHaveBeenCalledWith('user-1', 'user-2')
  })

  it('deve retornar 400 quando faltar targetUserId', async () => {
    const res = await request(app)
      .post('/rooms/dm')
      .set(auth)
      .send({})

    expect(res.status).toBe(400)
  })
})

// ── GET /rooms/:id/members ────────────────────────────────────
describe('GET /rooms/:id/members', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve retornar membros da sala', async () => {
    mockFindMembers.mockResolvedValue([
      { user_id: 'user-1', name: 'João' }
    ])

    const res = await request(app).get('/rooms/room-1/members').set(auth)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })
})

// ── GET /users/search ─────────────────────────────────────────
describe('GET /users/search', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve buscar usuários por nome ou email', async () => {
    mockSearchUsers.mockResolvedValue([
      { id: 'user-2', name: 'Maria', email: 'maria@email.com' }
    ])

    const res = await request(app)
      .get('/users/search?q=maria')
      .set(auth)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(mockSearchUsers).toHaveBeenCalledWith('maria')
  })

  it('deve retornar 400 quando faltar query', async () => {
    const res = await request(app).get('/users/search').set(auth)
    expect(res.status).toBe(400)
  })
})

// ── GET /users/:id ────────────────────────────────────────────
describe('GET /users/:id', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve retornar perfil do usuário', async () => {
    mockFindUserById.mockResolvedValue({ id: 'user-2', name: 'Maria' })

    const res = await request(app).get('/users/user-2').set(auth)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('id', 'user-2')
  })

  it('deve retornar 404 quando usuário não existir', async () => {
    mockFindUserById.mockResolvedValue(null)

    const res = await request(app).get('/users/nao-existe').set(auth)

    expect(res.status).toBe(404)
  })
})
