import pool from '../config/db.js'

export const findByEmail = async (email) => {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email]
  )
  return rows[0] ?? null
}

export const findById = async (id) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, photo, provider FROM users WHERE id = ? LIMIT 1',
    [id]
  )
  return rows[0] ?? null
}

export const findByGoogleId = async (googleId) => {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE google_id = ? LIMIT 1',
    [googleId]
  )
  return rows[0] ?? null
}

export const create = async ({ name, email, password, photo, provider, googleId }) => {
  const [result] = await pool.query(
    `INSERT INTO users (name, email, password, photo, provider, google_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, email, password ?? null, photo ?? null, provider, googleId ?? null]
  )
  return findById(result.insertId)
}