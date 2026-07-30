import express from 'express'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import passport from './config/oauth.js'
import authRouter from './routes/auth.js'
import roomsRouter from './routes/rooms.js'
import usersRouter from './routes/users.js'
import { connectRedis } from './config/redis.js'

dotenv.config()

const app = express()

// ── Middlewares ───────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(passport.initialize())

// ── Rotas ─────────────────────────────────────────────────────
app.use('/auth', authRouter)
app.use('/rooms', roomsRouter)
app.use('/users', usersRouter)

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true }))

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3000

const server = app.listen(PORT, async () => {
  await connectRedis()
  console.log(`Server running on port ${PORT}`)
})

export { server }
export default app
