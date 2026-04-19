import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()

export const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  })

export const signRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
  })

export const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_SECRET)

export const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET)

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure:   process.env.NODE_ENV === 'prod'
}