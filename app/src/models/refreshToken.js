import pool from '../config/db.js'

export const create = async ({ userId, token, expiresAt }) => {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES (?, ?, ?)`,
    [userId, token, expiresAt]
  )
}

export const findByToken = async (token) => {
  const [rows] = await pool.query(
    `SELECT * FROM refresh_tokens
     WHERE token = ? AND expires_at > NOW()
     LIMIT 1`,
    [token]
  )
  return rows[0] ?? null
}

export const deleteByToken = async (token) => {
  await pool.query(
    'DELETE FROM refresh_tokens WHERE token = ?',
    [token]
  )
}

export const deleteByUserId = async (userId) => {
  await pool.query(
    'DELETE FROM refresh_tokens WHERE user_id = ?',
    [userId]
  )
}

export const deleteExpired = async () => {
  await pool.query('DELETE FROM refresh_tokens WHERE expires_at <= NOW()')
}