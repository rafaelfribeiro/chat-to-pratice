import redis from '../config/redis.js'

const MAX_ATTEMPTS = 5
const WINDOW_SECS  = 60 * 60 // 1h

const key = (email) => `login:attempts:${email}`

export const getAttempts = async (email) => {
  const val = await redis.get(key(email))
  return parseInt(val ?? '0', 10)
}

export const incrementAttempts = async (email) => {
  const attempts = await redis.incr(key(email))
  if (attempts === 1) await redis.expire(key(email), WINDOW_SECS)
  return attempts
}

export const resetAttempts = async (email) => {
  await redis.set(key(email), '0')
}

export const isBlocked = async (email) => {
  const attempts = await getAttempts(email)
  return attempts >= MAX_ATTEMPTS
}

export { MAX_ATTEMPTS }
