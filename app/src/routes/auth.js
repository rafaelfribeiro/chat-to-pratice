import { Router } from 'express'
import bcrypt from 'bcrypt'
import passport from 'passport'
import { signAccessToken, signRefreshToken, verifyRefreshToken, cookieOptions } from '../config/jwt.js'
import * as UserModel from '../models/user.js'
import * as RefreshTokenModel from '../models/refreshToken.js'
import * as AccountReactivation from '../models/accountReactivation.js'
import { isBlocked, incrementAttempts, resetAttempts, MAX_ATTEMPTS } from '../middlewares/rateLimit.js'
import { sendReactivationEmail } from '../config/mailer.js'

const router = Router()

const issueTokens = async (res, user) => {
  const payload = { id: user.id, name: user.name, email: user.email }
  const accessToken  = signAccessToken(payload)
  const refreshToken = signRefreshToken(payload)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  await RefreshTokenModel.create({ userId: user.id, token: refreshToken, expiresAt })

  res.cookie('access_token',  accessToken,  { ...cookieOptions, maxAge: 10 * 60 * 1000 })
  res.cookie('refresh_token', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 })
}

const deactivateUser = async (user) => {
  await UserModel.deactivate(user.id)
  await RefreshTokenModel.deleteByUserId(user.id)
  const { token } = await AccountReactivation.create(user.id)
  await sendReactivationEmail(user.email, token)
}

// ── Login local ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password)
    return res.status(400).json({ error: 'Email e senha são obrigatórios' })

  if (await isBlocked(email))
    return res.status(429).json({ error: 'Conta bloqueada. Tente novamente em 1 hora.' })

  const user = await UserModel.findByEmail(email)
  if (!user || user.provider !== 'local')
    return res.status(401).json({ error: 'Credenciais inválidas' })

  // conta desativada?
  if (!user.active) {
    const deactivatedAt = new Date(user.deactivated_at)
    const diff = (Date.now() - deactivatedAt.getTime()) / (1000 * 60 * 60)

    // reativação automática após 24h
    if (diff >= 24) {
      await UserModel.reactivate(user.id)
      user.active = true
    } else {
      return res.status(403).json({ error: 'Conta desativada. Verifique seu e-mail para reativar.' })
    }
  }

  const valid = await bcrypt.compare(password, user.password)

  if (!valid) {
    const attempts = await incrementAttempts(email)
    if (attempts >= MAX_ATTEMPTS) {
      await deactivateUser(user)
      return res.status(429).json({ error: 'Conta bloqueada após 5 tentativas. Verifique seu e-mail.' })
    }
    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  await resetAttempts(email)
  await issueTokens(res, user)
  res.json({ id: user.id, name: user.name, email: user.email, photo: user.photo })
})

// ── Cadastro local ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' })

  const exists = await UserModel.findByEmail(email)
  if (exists)
    return res.status(409).json({ error: 'Email já cadastrado' })

  const hash = await bcrypt.hash(password, 12)
  const user = await UserModel.create({ name, email, password: hash, provider: 'local' })

  await issueTokens(res, user)
  res.status(201).json({ id: user.id, name: user.name, email: user.email })
})

// ── OAuth2 Google ─────────────────────────────────────────────
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  async (req, res) => {
    await issueTokens(res, req.user)
    res.redirect('/')
  }
)

// ── Reativação por link ───────────────────────────────────────
router.get('/reactivate', async (req, res) => {
  const { token } = req.query

  if (!token)
    return res.status(400).json({ error: 'Token é obrigatório' })

  const record = await AccountReactivation.findByToken(token)
  if (!record)
    return res.status(400).json({ error: 'Token inválido ou expirado' })

  const user = await UserModel.findById(record.user_id)
  await UserModel.reactivate(user.id)
  await AccountReactivation.markUsed(record.id)
  await issueTokens(res, user)

  res.redirect('/')
})

// ── Refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refresh_token
  if (!token)
    return res.status(401).json({ error: 'Não autenticado' })

  const saved = await RefreshTokenModel.findByToken(token)
  if (!saved)
    return res.status(401).json({ error: 'Refresh token inválido' })

  try {
    const payload = verifyRefreshToken(token)
    const user = await UserModel.findById(payload.id)

    await RefreshTokenModel.deleteByToken(token)
    await issueTokens(res, user)

    res.json({ ok: true })
  } catch {
    return res.status(401).json({ error: 'Refresh token expirado' })
  }
})

// ── Logout ────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const token = req.cookies?.refresh_token
  if (token) await RefreshTokenModel.deleteByToken(token)

  res.clearCookie('access_token')
  res.clearCookie('refresh_token')
  res.json({ ok: true })
})

export default router
