import { jest } from '@jest/globals'

// ── Mocks ─────────────────────────────────────────────────────
const mockFindByEmail    = jest.fn()
const mockCreate         = jest.fn()
const mockCreateToken    = jest.fn()
const mockDeactivate     = jest.fn()
const mockDeleteByUserId = jest.fn()

const mockRedisGet    = jest.fn()
const mockRedisSet    = jest.fn()
const mockRedisIncr   = jest.fn()
const mockRedisExpire = jest.fn()

jest.unstable_mockModule('../../src/models/user.js', () => ({
  findByEmail:    mockFindByEmail,
  findById:       jest.fn(),
  findByGoogleId: jest.fn(),
  create:         mockCreate,
  deactivate:     mockDeactivate,
  reactivate:     jest.fn()
}))

jest.unstable_mockModule('../../src/models/refreshToken.js', () => ({
  create:         mockCreateToken,
  findByToken:    jest.fn(),
  deleteByToken:  jest.fn(),
  deleteByUserId: mockDeleteByUserId,
  deleteExpired:  jest.fn()
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

jest.unstable_mockModule('bcrypt', () => ({
  default: {
    compare: jest.fn(),
    hash:    jest.fn()
  }
}))

jest.unstable_mockModule('../../src/models/accountReactivation.js', () => ({
  create:      jest.fn().mockResolvedValue({ token: 'token-abc' }),
  findByToken: jest.fn().mockResolvedValue(null),
  markUsed:    jest.fn()
}))

jest.unstable_mockModule('../../src/config/mailer.js', () => ({
  sendReactivationEmail: jest.fn().mockResolvedValue()
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

const validUser = {
  id:             'uuid-1',
  email:          'joao@email.com',
  password:       '$2b$12$validhash',
  provider:       'local',
  active:         true,
  deactivated_at: null
}

// ── Rate limit ────────────────────────────────────────────────
describe('POST /auth/login — rate limit', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve incrementar contador de tentativas no Redis a cada falha', async () => {
    mockFindByEmail.mockResolvedValue(validUser)
    mockRedisGet.mockResolvedValue('1')
    mockRedisIncr.mockResolvedValue(2)

    await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'senha_errada' })

    expect(mockRedisIncr).toHaveBeenCalledWith('login:attempts:joao@email.com')
  })

  it('deve bloquear login após 5 tentativas e retornar 429', async () => {
    mockFindByEmail.mockResolvedValue(validUser)
    mockRedisGet.mockResolvedValue('5')

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'senha_errada' })

    expect(res.status).toBe(429)
    expect(res.body).toHaveProperty('error')
  })

  it('deve desativar a conta ao atingir 5 tentativas', async () => {
    mockFindByEmail.mockResolvedValue(validUser)
    mockRedisGet.mockResolvedValue('4')
    mockRedisIncr.mockResolvedValue(5)

    await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'senha_errada' })

    expect(mockDeactivate).toHaveBeenCalledWith('uuid-1')
  })

  it('deve apagar todos os refresh tokens ao desativar a conta', async () => {
    mockFindByEmail.mockResolvedValue(validUser)
    mockRedisGet.mockResolvedValue('4')
    mockRedisIncr.mockResolvedValue(5)

    await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'senha_errada' })

    expect(mockDeleteByUserId).toHaveBeenCalledWith('uuid-1')
  })

  it('deve retornar 403 quando conta estiver desativada', async () => {
    mockFindByEmail.mockResolvedValue({ ...validUser, active: false, deactivated_at: new Date() })
    mockRedisGet.mockResolvedValue('0')

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'qualquer' })

    expect(res.status).toBe(403)
    expect(res.body).toHaveProperty('error')
  })

  it('deve zerar contador no Redis após login bem-sucedido', async () => {
    const { default: bcrypt } = await import('bcrypt')
    bcrypt.compare.mockResolvedValue(true)

    mockFindByEmail.mockResolvedValue(validUser)
    mockRedisGet.mockResolvedValue('2')
    mockCreateToken.mockResolvedValue()

    await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: 'senha_correta' })

    expect(mockRedisSet).toHaveBeenCalledWith('login:attempts:joao@email.com', '0')
  })
})

// ── Reativação ────────────────────────────────────────────────
describe('GET /auth/reactivate', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve retornar 400 quando token não for informado', async () => {
    const res = await request(app).get('/auth/reactivate')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('deve retornar 400 quando token for inválido ou expirado', async () => {
    const res = await request(app).get('/auth/reactivate?token=token_invalido')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })
})
