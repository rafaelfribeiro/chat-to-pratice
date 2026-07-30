import { Router } from 'express'
import { authenticate } from '../middlewares/auth.js'
import * as UserModel from '../models/user.js'

const router = Router()
router.use(authenticate)

// ── GET /users/search ─────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q } = req.query
  if (!q) return res.status(400).json({ error: 'Query é obrigatória' })

  const users = await UserModel.search(q)
  res.json(users)
})

// ── GET /users/:id ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const user = await UserModel.findById(req.params.id)
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
  res.json(user)
})

export default router
