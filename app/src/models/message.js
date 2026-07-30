import pool from '../config/db.js'

export const create = async ({ roomId, userId, content }) => {
  const [result] = await pool.query(
    `INSERT INTO messages (room_id, user_id, content, status)
     VALUES (?, ?, ?, 'pending')`,
    [roomId, userId, content]
  )
  return findById(result.insertId)
}

export const findById = async (id) => {
  const [rows] = await pool.query(
    'SELECT * FROM messages WHERE id = ? LIMIT 1',
    [id]
  )
  return rows[0] ?? null
}

export const updateStatus = async (id, status) => {
  await pool.query(
    'UPDATE messages SET status = ? WHERE id = ?',
    [status, id]
  )
}

export const findByRoom = async (roomId, limit = 50) => {
  const [rows] = await pool.query(
    `SELECT * FROM messages
     WHERE room_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [roomId, limit]
  )
  return rows.reverse()
}
