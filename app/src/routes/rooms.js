import { Router } from 'express'
import { authenticate } from '../middlewares/auth.js'
import * as RoomModel from '../models/room.js'
import * as RoomMemberModel from '../models/roomMember.js'

const router = Router()
router.use(authenticate)

// ── GET /rooms ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const rooms = await RoomModel.findByUser(req.user.id)
  res.json(rooms)
})

// ── POST /rooms/dm ────────────────────────────────────────────
router.post('/dm', async (req, res) => {
  const { targetUserId } = req.body
  if (!targetUserId)
    return res.status(400).json({ error: 'targetUserId é obrigatório' })

  const existing = await RoomModel.findDM(req.user.id, targetUserId)
  if (existing) return res.json(existing)

  const room = await RoomModel.createDM(req.user.id, targetUserId)
  res.status(201).json(room)
})

// ── GET /rooms/:id ────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const room = await RoomModel.findById(req.params.id)
  if (!room) return res.status(404).json({ error: 'Sala não encontrada' })
  res.json(room)
})

// ── POST /rooms ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, description, image } = req.body
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' })

  const room = await RoomModel.create({ name, description, image, createdBy: req.user.id })
  res.status(201).json(room)
})

// ── GET /rooms/:id/members ────────────────────────────────────
router.get('/:id/members', async (req, res) => {
  const members = await RoomMemberModel.findByRoom(req.params.id)
  res.json(members)
})

export default router
