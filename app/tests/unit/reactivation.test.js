import { jest } from '@jest/globals'

// ── Mocks ─────────────────────────────────────────────────────
const mockFindByEmail       = jest.fn()
const mockFindById          = jest.fn()
const mockDeactivate        = jest.fn()
const mockReactivate        = jest.fn()
const mockCreateToken       = jest.fn()
const mockDeleteByUserId    = jest.fn()
const mockFindByToken       = jest.fn()
const mockMarkUsed          = jest.fn()
const mockCreateReactivation = jest.fn()
const mockSendMail          = jest.fn()

const mockRedisGet    = jest.fn().mockResolvedValue('0')
const mockRedisIncr   = jest.fn()
const mockRedisSet    = jest.fn()
const mockRedisExpire = jest.fn()

jest.unstable_mockModule('../../src/models/user.js', () => ({
  findByEmail:  mockFindByEmail,
  findById:     mockFindById,
  findByGoogleId: jest.fn(),
  create:       jest.fn(),
  deactivate:   mockDeactivate,
  reactivate:   mockReactivate
}))

jest.unstable_mockModule('../../src/models/refreshToken.js', () => ({
  create:         mockCreateToken,
  findByToken:    jest.fn(),
  deleteByToken:  jest.fn(),
  deleteByUserId: mockDeleteByUserId,
  deleteExpired:  jest.fn()
}))

jest.unstable_mockModule('../../src/models/accountReactivation.js', () => ({
  create:      mockCreateReactivation,
  findByToken: mockFindByToken,
  markUsed:    mockMarkUsed
}))

jest.unstable_mockModule('../../src/config/jwt.js', () => ({
  signAccessToken:    () => 'mock_access_token',
  signRefreshToken:   () => 'mock_refresh_token',
  verifyAccessToken:  jest.fn(),
  verifyRefreshToken: jest.fn(),
  cookieOptions:      {}
}))

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  connectRedis: jest.fn().mockResolvedValue(),
  default: {
    get:    mockRedisGet,
    set:    mockRedisSet,
    incr:   mockRedisIncr,
    expire: mockRedisExpire,
    del:    jest.fn()
  }
}))

jest.unstable_mockModule('../../src/config/mailer.js', () => ({
  sendReactivationEmail: mockSendMail
}))

jest.unstable_mockModule('bcrypt', () => ({
  default: {
    compare: jest.fn().mockResolvedValue(false),
    hash:    jest.fn().mockResolvedValue('hash_mockado')
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

const activeUser = {
  id:            'uuid-1',
  email:         'joao@email.com',
  password:      'hash',
  provider:      'local',
  active:        true,
  deactivated_at: null
}

const inactiveUser = (hoursAgo) => {
  const deactivated_at = new Date()
  deactivated_at.setHours(deactivated_at.getHours() - hoursAgo)
  return { ...activeUser, active: false, deactivated_at }
}

// ── Envio de e-mail ao desativar ──────────────────────────────
describe('desativação de conta', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve enviar e-mail de reativação ao desativar a conta', async () => {
    mockFindByEmail.mockResolvedValue(activeUser)
    mockRedisGet.mockResolvedValue('4')
    mockRedisIncr.mockResolvedValue(5)
    mockDeactivate.mockResolvedValue()
    mockDeleteByUserId.mockResolvedValue()
    mockCreateReactivation.mockResolvedValue({ token: 'token-abc' })

    await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'senha_errada' })

    expect(mockSendMail).toHaveBeenCalledWith('joao@email.com', expect.any(String))
  })

  it('deve criar token de reativação ao desativar a conta', async () => {
    mockFindByEmail.mockResolvedValue(activeUser)
    mockRedisGet.mockResolvedValue('4')
    mockRedisIncr.mockResolvedValue(5)
    mockDeactivate.mockResolvedValue()
    mockDeleteByUserId.mockResolvedValue()
    mockCreateReactivation.mockResolvedValue({ token: 'token-abc' })

    await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'senha_errada' })

    expect(mockCreateReactivation).toHaveBeenCalledWith('uuid-1')
  })
})

// ── Reativação automática (24h) ───────────────────────────────
describe('POST /auth/login — reativação automática', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve reativar automaticamente se 24h já passaram', async () => {
    mockFindByEmail.mockResolvedValue(inactiveUser(25))
    mockRedisGet.mockResolvedValue('0')
    mockReactivate.mockResolvedValue()
    mockCreateToken.mockResolvedValue()

    const { default: bcrypt } = await import('bcrypt')
    bcrypt.compare.mockResolvedValue(true)

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'senha_correta' })

    expect(mockReactivate).toHaveBeenCalledWith('uuid-1')
    expect(res.status).toBe(200)
  })

  it('deve retornar 403 se conta desativada há menos de 24h', async () => {
    mockFindByEmail.mockResolvedValue(inactiveUser(10))
    mockRedisGet.mockResolvedValue('0')

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'qualquer' })

    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })
})

// ── Reativação por link ───────────────────────────────────────
describe('GET /auth/reactivate', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve retornar 400 quando token não for informado', async () => {
    const res = await request(app).get('/auth/reactivate')
    expect(res.status).toBe(400)
  })

  it('deve retornar 400 quando token for inválido ou expirado', async () => {
    mockFindByToken.mockResolvedValue(null)

    const res = await request(app).get('/auth/reactivate?token=invalido')
    expect(res.status).toBe(400)
  })

  it('deve reativar conta e redirecionar para home com token válido', async () => {
    mockFindByToken.mockResolvedValue({ id: 'react-1', user_id: 'uuid-1' })
    mockFindById.mockResolvedValue(activeUser)
    mockReactivate.mockResolvedValue()
    mockMarkUsed.mockResolvedValue()
    mockCreateToken.mockResolvedValue()

    const res = await request(app).get('/auth/reactivate?token=token-valido')

    expect(mockReactivate).toHaveBeenCalledWith('uuid-1')
    expect(mockMarkUsed).toHaveBeenCalledWith('react-1')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/')
  })
})
