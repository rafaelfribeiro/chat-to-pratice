import pool from '../config/db.js'

export const findByRoom = async (roomId) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.photo, rm.joined_at
     FROM room_members rm
     INNER JOIN users u ON u.id = rm.user_id
     WHERE rm.room_id = ?`,
    [roomId]
  )
  return rows
}

export const findMember = async (roomId, userId) => {
  const [rows] = await pool.query(
    `SELECT * FROM room_members WHERE room_id = ? AND user_id = ? LIMIT 1`,
    [roomId, userId]
  )
  return rows[0] ?? null
}

export const addMember = async (roomId, userId) => {
  await pool.query(
    `INSERT IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)`,
    [roomId, userId]
  )
}

export const removeMember = async (roomId, userId) => {
  await pool.query(
    `DELETE FROM room_members WHERE room_id = ? AND user_id = ?`,
    [roomId, userId]
  )
}
