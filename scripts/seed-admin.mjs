import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

// NOTE: App1 + App2 share the `users` collection but use INCOMPATIBLE schemas
// (app1 snake_case `password_hash` vs app2 camelCase `passwordHash`). Never reuse
// an email that App2 seeds (e.g. wasifzahoor296@gmail.com) or the last writer wins
// and breaks login on the other app.
const SEEDS = [
  { email: 'app1admin@tract-test.com', password: 'admin1234!', role: 'admin', full_name: 'App1 Admin', phone: '+13330000002' },
]

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI)
  const users = mongoose.connection.db.collection('users')
  for (const s of SEEDS) {
    const email = s.email.toLowerCase().trim()
    const password_hash = await bcrypt.hash(s.password, 10)
    await users.deleteMany({ email })
    await users.insertOne({
      email,
      phone: s.phone,
      password_hash,
      role: s.role,
      state_code: 'TX',
      dob: new Date('1990-01-01'),
      full_name: s.full_name,
      kyc_status: 'verified',
      bank_verified: true,
      reliability_score: 100,
      professional_score: 100,
      deal_count: 0,
      restriction_status: 'normal',
      restricted_until: null,
      is_banned: false,
      ban_reason: null,
      last_active_at: null,
      otp_code: null,
      otp_expires_at: null,
      otp_purpose: null,
      current_session_id: null,
      deleted_at: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    console.log(`seeded ${email} (${s.role})`)
  }
  await mongoose.disconnect()
  console.log('Done.')
}
run().catch((e) => { console.error(e); process.exit(1) })
