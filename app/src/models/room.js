import pool from '../config/db.js'

export const findByUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT r.* FROM rooms r
     INNER JOIN room_members rm ON rm.room_id = r.id
     WHERE rm.user_id = ?
     ORDER BY r.created_at DESC`,
    [userId]
  )
  return rows
}

export const findById = async (id) => {
  const [rows] = await pool.query(
    'SELECT * FROM rooms WHERE id = ? LIMIT 1',
    [id]
  )
  return rows[0] ?? null
}

export const create = async ({ name, description, image, createdBy }) => {
  const [result] = await pool.query(
    `INSERT INTO rooms (name, description, image, type, created_by)
     VALUES (?, ?, ?, 'group', ?)`,
    [name, description ?? null, image ?? null, createdBy]
  )
  return findById(result.insertId)
}

export const findDM = async (userId1, userId2) => {
  const [rows] = await pool.query(
    `SELECT r.* FROM rooms r
     INNER JOIN room_members rm1 ON rm1.room_id = r.id AND rm1.user_id = ?
     INNER JOIN room_members rm2 ON rm2.room_id = r.id AND rm2.user_id = ?
     WHERE r.type = 'dm'
     LIMIT 1`,
    [userId1, userId2]
  )
  return rows[0] ?? null
}

export const createDM = async (userId1, userId2) => {
  const [result] = await pool.query(
    `INSERT INTO rooms (type, created_by) VALUES ('dm', ?)`,
    [userId1]
  )
  const roomId = result.insertId
  await pool.query(
    `INSERT INTO room_members (room_id, user_id) VALUES (?, ?), (?, ?)`,
    [roomId, userId1, roomId, userId2]
  )
  return findById(roomId)
}
