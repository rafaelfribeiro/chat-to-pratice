import { verifyAccessToken } from '../config/jwt.js'

export const authenticate = (req, res, next) => {
  const token = req.cookies?.access_token

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado' })
  }

  try {
    const payload = verifyAccessToken(token)
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}