import { jest } from '@jest/globals'

// ── Mocks ─────────────────────────────────────────────────────
const mockFindByEmail  = jest.fn()
const mockCreate       = jest.fn()
const mockCreateToken  = jest.fn()

const mockRedisGet    = jest.fn().mockResolvedValue('0')
const mockRedisIncr   = jest.fn()
const mockRedisSet    = jest.fn()
const mockRedisExpire = jest.fn()

jest.unstable_mockModule('../../src/models/user.js', () => ({
  findByEmail:    mockFindByEmail,
  findById:       jest.fn(),
  findByGoogleId: jest.fn(),
  create:         mockCreate,
  deactivate:     jest.fn()
}))

jest.unstable_mockModule('../../src/models/refreshToken.js', () => ({
  create:         mockCreateToken,
  findByToken:    jest.fn(),
  deleteByToken:  jest.fn(),
  deleteByUserId: jest.fn(),
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

// ── Cadastro ──────────────────────────────────────────────────
describe('POST /auth/register', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve cadastrar um novo usuário com sucesso', async () => {
    mockFindByEmail.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'uuid-1', name: 'João', email: 'joao@email.com' })
    mockCreateToken.mockResolvedValue()

    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'João', email: 'joao@email.com', password: '123456' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.email).toBe('joao@email.com')
  })

  it('deve retornar 400 quando faltar campos obrigatórios', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'joao@email.com' })

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('deve retornar 409 quando email já estiver cadastrado', async () => {
    mockFindByEmail.mockResolvedValue({ id: 'uuid-1', email: 'joao@email.com' })

    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'João', email: 'joao@email.com', password: '123456' })

    expect(res.status).toBe(409)
    expect(res.body).toHaveProperty('error')
  })
})

// ── Login ─────────────────────────────────────────────────────
describe('POST /auth/login', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deve retornar 400 quando faltar campos obrigatórios', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com' })

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('deve retornar 401 quando usuário não existir', async () => {
    mockFindByEmail.mockResolvedValue(null)
    mockRedisGet.mockResolvedValue('0')

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: '123456' })

    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error')
  })

  it('deve retornar 401 quando senha for incorreta', async () => {
    mockFindByEmail.mockResolvedValue({
      id:       'uuid-1',
      email:    'joao@email.com',
      password: 'hash_errado',
      provider: 'local',
      active:   true
    })
    mockRedisGet.mockResolvedValue('0')
    mockRedisIncr.mockResolvedValue(1)

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'joao@email.com', password: '123456' })

    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error')
  })
})

// ── Logout ────────────────────────────────────────────────────
describe('POST /auth/logout', () => {
  it('deve limpar os cookies e retornar ok', async () => {
    const res = await request(app)
      .post('/auth/logout')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})
