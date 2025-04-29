// Konfigurasi untuk autentikasi Passport.js
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import User from '../models/user.js';

// Konfigurasi strategi lokal untuk Passport
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await User.findOne({ where: { username } });
      
      // Cek jika user tidak ditemukan atau password tidak sesuai
      if (!user || !(await user.comparePassword(password))) {
        return done(null, false, { message: 'Username atau password salah' });
      }
      
      // Autentikasi berhasil
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Konfigurasi serializeUser untuk menyimpan informasi user di session
passport.serializeUser((user, done) => done(null, user.id));

// Konfigurasi deserializeUser untuk mendapatkan data user dari ID
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

export default passport;