import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import * as UserModel from '../models/user.js'
import dotenv from 'dotenv'

dotenv.config()

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // usuário já existe?
      let user = await UserModel.findByGoogleId(profile.id)

      if (!user) {
        // cria na primeira vez
        user = await UserModel.create({
          name:     profile.displayName,
          email:    profile.emails[0].value,
          photo:    profile.photos[0]?.value ?? null,
          provider: 'google',
          googleId: profile.id
        })
      }

      return done(null, user)
    } catch (err) {
      return done(err, null)
    }
  }
))

export default passport