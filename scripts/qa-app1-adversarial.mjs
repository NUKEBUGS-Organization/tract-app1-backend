import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })
const API = 'http://localhost:3000/api/v1'
const URI = process.env.MONGODB_URI
const OTP = '123456'
const out = []
const ok = (n, d = '') => { out.push({ n, ok: true }); console.log(`✅ ${n}${d ? ' — ' + d : ''}`) }
const bug = (n, d) => { out.push({ n, ok: false, d }); console.log(`🐛 ${n} — ${d}`) }
const info = (n, d) => console.log(`•  ${n} — ${d}`)

const j = async (p, o = {}) => {
  const r = await fetch(API + p, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers ?? {}) } })
  const t = await r.text(); let b; try { b = t ? JSON.parse(t) : null } catch { b = t }
  return { status: r.status, body: b, ok: r.ok }
}
const auth = (t) => ({ Authorization: `Bearer ${t}` })
let n = 0
async function reg(role) {
  n++
  const uniq = `${Date.now().toString(36)}${n}${Math.floor(Math.random()*1e6)}`
  const email = `adv1_${role}_${uniq}@test.com`
  const phone = `+1332${String(Date.now()*1000 + n + Math.floor(Math.random()*1000)).slice(-7)}`
  await j('/auth/register', { method: 'POST', body: JSON.stringify({ full_name: `A ${role}`, email, phone, password: 'Password1!', role, state_code: 'TX', dob: '1990-01-01' }) })
  const r = await j('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp: OTP, purpose: 'login' }) })
  const token = r.body?.data?.access_token
  for (let i=0;i<20 && !token;i++){ await new Promise(r=>setTimeout(r,50)); const rr=await j('/auth/verify-otp',{method:'POST',body:JSON.stringify({email,otp:OTP,purpose:'login'})}); }
  const doc = await mongoose.connection.db.collection('users').findOne({ email })
  if (!doc) throw new Error('reg failed for '+email)
  return { email, token, uid: doc._id }
}
async function login(email, pw) {
  await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })
  const r = await j('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp: OTP, purpose: 'login' }) })
  return r.body?.data?.access_token
}
async function liveListing(seller, admin, reserve = 200000) {
  let r = await j('/listings', { method: 'POST', headers: auth(seller.token), body: JSON.stringify({ property_type: 'sfh', address: `Adv1 ${Date.now()}_${++n}`, zip_code: '75201', state_code: 'TX', year_built: 1998, zoning: 'Residential', market_price: 300000, hidden_reserve: reserve }) })
  const id = r.body.data._id
  await mongoose.connection.db.collection('documentvaults').insertMany(['survey', 'tax_bill'].map((t) => ({
    listing_id: new mongoose.Types.ObjectId(id), uploaded_by: seller.uid, document_type: t,
    file_url: 'x', file_name: t, file_key: 'k' + t, mime_type: 'application/pdf', createdAt: new Date(), updatedAt: new Date(),
  })))
  await j(`/listings/${id}/submit`, { method: 'POST', headers: auth(seller.token) })
  await j(`/admin/listings/${id}/approve`, { method: 'POST', headers: auth(admin) })
  return id
}
async function verify(u, role) {
  if (!u?.uid) return
  await mongoose.connection.db.collection('verifications').deleteMany({ user_id: u.uid })
  await mongoose.connection.db.collection('verifications').insertOne({ user_id: u.uid, type: role, status: 'approved', document_url: 'x', license_number: 'L1', brokerage_name: 'B', broker_name: 'B', office_address: 'O', createdAt: new Date(), updatedAt: new Date() })
}

async function main() {
  console.log('\n🗡️  TRACT App1 adversarial\n')
  await mongoose.connect(URI)
  const admin = await login('app1admin@tract-test.com', 'admin1234!')
  const seller = await reg('seller')

  // 1. 10-bid cap race
  {
    const listingId = await liveListing(seller, admin)
    const ws = await Promise.all(Array.from({ length: 16 }, () => reg('wholesaler')))
    await Promise.all(ws.map((w) => verify(w, 'wholesaler')))
    const res = await Promise.all(ws.map((w) => j(`/listings/${listingId}/bids`, { method: 'POST', headers: auth(w.token), body: JSON.stringify({ bid_price: 215000, inspection_period: 7, due_diligence_period: 10 }) })))
    const created = res.filter((r) => [200, 201].includes(r.status)).length
    const fives = res.filter((r) => r.status >= 500).length
    const dbc = await mongoose.connection.db.collection('bids').countDocuments({ property_id: new mongoose.Types.ObjectId(listingId) })
    if (fives) bug('Bid-cap race (5xx)', `${fives}`)
    if (created > 10 || dbc > 10) bug('App1 10-bid cap not atomic', `${created} created / ${dbc} in DB`)
    else ok('App1 10-bid cap holds', `${created}/${dbc}`)
  }

  // 2. Parallel select race (3 different bids selected as primary at once)
  let listingId, bids, sellerB
  {
    sellerB = await reg('seller')
    listingId = await liveListing(sellerB, admin)
    const ws = await Promise.all(Array.from({ length: 3 }, () => reg('wholesaler')))
    await Promise.all(ws.map((w) => verify(w, 'wholesaler')))
    bids = []
    for (const w of ws) {
      const r = await j(`/listings/${listingId}/bids`, { method: 'POST', headers: auth(w.token), body: JSON.stringify({ bid_price: 210000 + Math.floor(Math.random() * 9000), inspection_period: 7, due_diligence_period: 10 }) })
      bids.push(r.body?.data?._id)
    }
    const sel = await Promise.all(bids.map((bid) => j(`/listings/${listingId}/bids/${bid}/select`, { method: 'POST', headers: auth(sellerB.token), body: JSON.stringify({ selection: 1 }) })))
    const okc = sel.filter((x) => x.ok).length
    const fives = sel.filter((x) => x.status >= 500).length
    const selectedCount = await mongoose.connection.db.collection('bids').countDocuments({ property_id: new mongoose.Types.ObjectId(listingId), status: 'selected' })
    if (fives) bug('Select race (5xx)', `${fives}`)
    if (selectedCount > 1) bug('Parallel select → multiple primary bids', `${selectedCount} bids marked selected (expected 1)`)
    else ok('Parallel select yields exactly one primary', `${okc} ok calls, ${selectedCount} selected`)
  }

  // 3. Contract double-create + double-sign → at most one deal
  {
    const primaryBid = (await mongoose.connection.db.collection('bids').findOne({ property_id: new mongoose.Types.ObjectId(listingId), status: 'selected' }))
    if (primaryBid) {
      const cc = await Promise.all(Array.from({ length: 4 }, () => j(`/contracts/listing/${listingId}`, { method: 'POST', headers: auth(sellerB.token), body: JSON.stringify({ bid_id: String(primaryBid._id), emd_amount: 2000, closing_days: 30 }) })))
      const contractIds = new Set(cc.filter((x) => x.ok).map((x) => x.body?.data?._id).filter(Boolean))
      const dbContracts = await mongoose.connection.db.collection('contracts').countDocuments({ bid_id: primaryBid._id })
      if (dbContracts > 1) bug('Contract double-create', `${dbContracts} contracts for one bid`)
      else ok('Contract create idempotent per bid', `${dbContracts} contract`)
      const cid = [...contractIds][0] || (await mongoose.connection.db.collection('contracts').findOne({ bid_id: primaryBid._id }))?._id
      const buyerUid = primaryBid.bidder_id
      const buyerDoc = await mongoose.connection.db.collection('users').findOne({ _id: buyerUid })
      const buyerTok = await login(buyerDoc.email, 'Password1!')
      // double-sign in parallel
      await Promise.all([
        j(`/contracts/${cid}/sign/seller`, { method: 'POST', headers: auth(sellerB.token) }),
        j(`/contracts/${cid}/sign/seller`, { method: 'POST', headers: auth(sellerB.token) }),
      ])
      await Promise.all([
        j(`/contracts/${cid}/sign/buyer`, { method: 'POST', headers: auth(buyerTok) }),
        j(`/contracts/${cid}/sign/buyer`, { method: 'POST', headers: auth(buyerTok) }),
      ])
      await new Promise((r) => setTimeout(r, 600))
      const deals = await mongoose.connection.db.collection('deals').countDocuments({ contract_id: new mongoose.Types.ObjectId(String(cid)) })
      if (deals > 1) bug('Double-sign → multiple deals', `${deals} deals for one contract`)
      else if (deals === 1) ok('Double-sign → exactly one deal')
      else info('Double-sign', 'no deal created (unexpected)')
    } else info('Contract test', 'no selected bid, skipped')
  }

  // 4. Score penalty as non-admin
  {
    const w = await reg('wholesaler')
    const r = await j('/scores/penalty', { method: 'POST', headers: auth(w.token), body: JSON.stringify({ user_id: String(w.uid), event_type: 'ghosting', points: -10, reason: 'self' }) })
    if (r.ok) bug('Score penalty authz', `non-admin applied a penalty (status ${r.status})`)
    else ok('Score penalty requires admin', `status ${r.status}`)
    // self-score read of another user
    const r2 = await j(`/users/${seller.uid}/score`, { headers: auth(w.token) })
    info('Cross-user score read', `wholesaler → seller score: status ${r2.status}`)
  }

  // 5. Withdraw listing that has bids
  {
    const r = await j(`/listings/${listingId}`, { method: 'DELETE', headers: auth(sellerB.token) })
    if (r.ok) bug('Withdraw with bids', `DELETE succeeded on a listing with bids (status ${r.status})`)
    else ok('Withdraw blocked when bids exist', `status ${r.status}`)
  }

  // 6. Payload abuse — never 5xx
  {
    const w = await reg('wholesaler'); await verify(w, 'wholesaler')
    const cases = [
      ['bad listing id GET', 'GET', '/listings/not-an-id', null],
      ['bad deal id GET', 'GET', '/deals/nope', null],
      ['neg bid_price', 'POST', `/listings/${listingId}/bids`, { bid_price: -1, inspection_period: 7, due_diligence_period: 10 }],
      ['huge bid_price', 'POST', `/listings/${listingId}/bids`, { bid_price: 1e308, inspection_period: 7, due_diligence_period: 10 }],
      ['commission oob', 'POST', `/listings/${listingId}/bids`, { bid_price: 210000, commission_percentage: 999 }],
      ['proto pollution', 'POST', `/listings/${listingId}/bids`, JSON.parse('{"__proto__":{"x":1},"bid_price":210000,"inspection_period":7,"due_diligence_period":10}')],
      ['huge string', 'PATCH', `/listings/${listingId}`, { motivation: 'A'.repeat(300000) }],
      ['select bad enum', 'POST', `/listings/${listingId}/bids/000000000000000000000000/select`, { selection: 99 }],
    ]
    let fives = 0
    for (const [name, m, path, body] of cases) {
      const r = await j(path, { method: m, headers: auth(w.token), body: body ? JSON.stringify(body) : undefined })
      if (r.status >= 500) { fives++; bug(`Payload abuse: ${name}`, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`) }
    }
    if (!fives) ok('Payload abuse — 0 × 5xx across 8 payloads')
  }

  await mongoose.disconnect()
  const bugs = out.filter((x) => !x.ok)
  console.log(`\n────────────────────────────────\n${out.filter((x) => x.ok).length} ok, ${bugs.length} suspected bug(s)`)
  bugs.forEach((b) => console.log(`  🐛 ${b.n}: ${b.d}`))
  process.exit(bugs.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
