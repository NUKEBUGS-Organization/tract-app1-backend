import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

const API = (process.env.QA_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '')
const URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/tract_local'
const OTP = process.env.TEST_OTP_CODE ?? '123456'
const stamp = Date.now()
const results = []
const pass = (n) => { results.push({ n, ok: true }); console.log(`✅ ${n}`) }
const fail = (n, e) => { results.push({ n, ok: false, e: String(e?.message ?? e) }); console.log(`❌ ${n}: ${e?.message ?? e}`) }

async function api(path, opts = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  })
  const t = await res.text()
  let b; try { b = t ? JSON.parse(t) : null } catch { b = t }
  return { status: res.status, body: b, ok: res.ok }
}
const auth = (t) => ({ Authorization: `Bearer ${t}` })

async function register(role, off) {
  const email = `qa1_${role}_${stamp + off}@test.com`
  const phone = `+1332${5}${String(stamp + off).slice(-6)}`
  let r = await api('/auth/register', { method: 'POST', body: JSON.stringify({
    full_name: `QA ${role}`, email, phone, password: 'Password1!', role, state_code: 'TX', dob: '1990-01-01',
  }) })
  if (![200, 201].includes(r.status)) throw new Error(`register ${role}: ${r.status} ${JSON.stringify(r.body)}`)
  r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp: OTP, purpose: 'login' }) })
  if (!r.ok) throw new Error(`verify-otp ${role}: ${r.status} ${JSON.stringify(r.body)}`)
  const token = r.body?.data?.access_token ?? r.body?.access_token ?? r.body?.data?.accessToken
  const uid = r.body?.data?.user?._id ?? r.body?.data?.user?.id ?? r.body?.data?.userId
  return { email, phone, token, uid }
}
async function login(email, password) {
  let r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.body)}`)
  r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, otp: OTP, purpose: 'login' }) })
  if (!r.ok) throw new Error(`verify-otp ${email}: ${r.status} ${JSON.stringify(r.body)}`)
  return r.body?.data?.access_token ?? r.body?.data?.accessToken
}

const db = () => mongoose.connection.db

async function main() {
  console.log(`\n🏠 TRACT App1 flow — ${API}\n`)
  await mongoose.connect(URI)

  let seller, wholesaler, realtor, adminToken
  try { seller = await register('seller', 1); pass('Register seller + 2FA') } catch (e) { fail('Register seller + 2FA', e) }
  try { wholesaler = await register('wholesaler', 2); pass('Register wholesaler + 2FA') } catch (e) { fail('Register wholesaler + 2FA', e) }
  try { realtor = await register('realtor', 3); pass('Register realtor + 2FA') } catch (e) { fail('Register realtor + 2FA', e) }
  try { adminToken = await login('app1admin@tract-test.com', 'admin1234!'); pass('Admin login') } catch (e) { fail('Admin login', e) }

  // resolve uids from DB (register response shape varies)
  const uById = {}
  for (const u of [seller, wholesaler, realtor].filter(Boolean)) {
    const doc = await db().collection('users').findOne({ email: u.email })
    u.uid = doc?._id
    uById[u.email] = doc?._id
  }

  try {
    const r = await api('/auth/register', { method: 'POST', body: JSON.stringify({
      full_name: 'X', email: `qa1_admin_${stamp}@test.com`, phone: `+13325${String(stamp).slice(-6)}`,
      password: 'Password1!', role: 'admin', state_code: 'TX', dob: '1990-01-01',
    }) })
    if (r.status === 201 || r.status === 200) fail('Register blocks admin role', new Error('admin registration succeeded'))
    else pass('Register blocks admin role')
  } catch (e) { fail('Register blocks admin role', e) }

  // ---- Listing lifecycle ----
  let listingId
  try {
    let r = await api('/listings', { method: 'POST', headers: auth(seller.token), body: JSON.stringify({
      property_type: 'sfh', address: `12 App1 QA St ${stamp}`, zip_code: '75201', state_code: 'TX',
      year_built: 1998, zoning: 'Residential', market_price: 250000, hidden_reserve: 200000,
    }) })
    if (![200, 201].includes(r.status)) throw new Error(`create listing ${r.status} ${JSON.stringify(r.body)}`)
    listingId = r.body?.data?._id ?? r.body?.data?.id ?? r.body?._id
    if (!listingId) { const d = await db().collection('listings').findOne({ address: `12 App1 QA St ${stamp}` }); listingId = d?._id }
    pass('Seller creates listing (draft)')
  } catch (e) { fail('Seller creates listing (draft)', e) }

  try {
    let r = await api(`/listings/${listingId}/submit`, { method: 'POST', headers: auth(seller.token) })
    if (r.status === 400 && /Missing required documents/i.test(JSON.stringify(r.body))) pass('Submit blocked without survey + tax_bill')
    else fail('Submit blocked without survey + tax_bill', new Error(`got ${r.status} ${JSON.stringify(r.body)}`))
  } catch (e) { fail('Submit blocked without survey + tax_bill', e) }

  // seed required docs directly (S3 upload path unavailable locally)
  try {
    await db().collection('documentvaults').insertMany(['survey', 'tax_bill'].map((t) => ({
      listing_id: new mongoose.Types.ObjectId(listingId),
      uploaded_by: seller.uid, document_type: t,
      file_url: `https://example.com/${t}.pdf`, file_name: `${t}.pdf`, file_key: `k/${t}`, mime_type: 'application/pdf',
      createdAt: new Date(), updatedAt: new Date(),
    })))
    pass('Seed survey + tax_bill documents')
  } catch (e) { fail('Seed survey + tax_bill documents', e) }

  try {
    const r = await api(`/listings/${listingId}/submit`, { method: 'POST', headers: auth(seller.token) })
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    pass('Seller submits listing → submitted')
  } catch (e) { fail('Seller submits listing → submitted', e) }

  try {
    const r = await api(`/admin/listings/${listingId}/approve`, { method: 'POST', headers: auth(adminToken) })
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    pass('Admin approves listing → live')
  } catch (e) { fail('Admin approves listing → live', e) }

  try {
    const r = await api('/listings')
    const arr = r.body?.data?.data ?? r.body?.data?.listings ?? (Array.isArray(r.body?.data)?r.body.data:[])
    if (Array.isArray(arr) && arr.some((l) => (l._id ?? l.id) === String(listingId))) pass('Live listing visible in marketplace')
    else fail('Live listing visible in marketplace', new Error('not found in GET /listings'))
  } catch (e) { fail('Live listing visible in marketplace', e) }

  // ---- Verification gates ----
  try {
    const r = await api('/listings/' + listingId + '/bids', { method: 'POST', headers: auth(wholesaler.token), body: JSON.stringify({ bid_price: 210000, inspection_period: 7, due_diligence_period: 10 }) })
    if (r.status === 403) pass('Bid blocked — wholesaler not verified')
    else fail('Bid blocked — wholesaler not verified', new Error(`got ${r.status} ${JSON.stringify(r.body)}`))
  } catch (e) { fail('Bid blocked — wholesaler not verified', e) }

  try {
    await db().collection('verifications').deleteMany({ user_id: { $in: [wholesaler.uid, realtor.uid] } })
    await db().collection('verifications').insertMany([
      { user_id: wholesaler.uid, type: 'wholesaler', status: 'approved', document_url: 'https://example.com/proof.pdf', createdAt: new Date(), updatedAt: new Date() },
      { user_id: realtor.uid, type: 'realtor', status: 'approved', document_url: 'https://example.com/license.pdf', license_number: 'RE-1', brokerage_name: 'QA Brokerage', broker_name: 'B', office_address: 'O', createdAt: new Date(), updatedAt: new Date() },
    ])
    pass('Seed approved wholesaler + realtor verifications')
  } catch (e) { fail('Seed approved wholesaler + realtor verifications', e) }

  // ---- Bidding ----
  let whBidId, rlBidId
  try {
    const r = await api(`/listings/${listingId}/bids`, { method: 'POST', headers: auth(wholesaler.token), body: JSON.stringify({ bid_price: 215000, inspection_period: 7, due_diligence_period: 10 }) })
    if (![200, 201].includes(r.status)) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    whBidId = r.body?.data?._id ?? r.body?.data?.id
    pass('Wholesaler places bid')
  } catch (e) { fail('Wholesaler places bid', e) }

  try {
    const r = await api(`/listings/${listingId}/bids`, { method: 'POST', headers: auth(realtor.token), body: JSON.stringify({ bid_price: 220000, commission_percentage: 3, closing_timeline_days: 30, agency_role: 'Transaction Coordinator', payment_source: 'Seller Pays Commission' }) })
    if (![200, 201].includes(r.status)) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    rlBidId = r.body?.data?._id ?? r.body?.data?.id
    pass('Realtor places bid (commission fields)')
  } catch (e) { fail('Realtor places bid (commission fields)', e) }

  try {
    const r = await api(`/listings/${listingId}/bids`, { method: 'POST', headers: auth(wholesaler.token), body: JSON.stringify({ bid_price: 216000, inspection_period: 7, due_diligence_period: 10 }) })
    if (r.status >= 400) pass('Duplicate bid by same user rejected')
    else fail('Duplicate bid by same user rejected', new Error(`got ${r.status}`))
  } catch (e) { fail('Duplicate bid by same user rejected', e) }

  try {
    const r = await api(`/listings/${listingId}/bids`, { method: 'POST', headers: auth(wholesaler.token), body: JSON.stringify({ bid_price: 100, inspection_period: 7, due_diligence_period: 10 }) })
    if (r.status >= 400) pass('Lowball bid below hidden reserve rejected')
    else fail('Lowball bid below hidden reserve rejected', new Error(`got ${r.status} ${JSON.stringify(r.body)}`))
  } catch (e) { fail('Lowball bid below hidden reserve rejected', e) }

  try {
    const r = await api(`/listings/${listingId}/bids`, { method: 'POST', headers: auth(seller.token), body: JSON.stringify({ bid_price: 230000, inspection_period: 7, due_diligence_period: 10 }) })
    if (r.status >= 400) pass('Seller cannot bid on own listing')
    else fail('Seller cannot bid on own listing', new Error(`got ${r.status}`))
  } catch (e) { fail('Seller cannot bid on own listing', e) }

  // ---- Selection ----
  try {
    const r = await api(`/listings/${listingId}/bids/${whBidId}/select`, { method: 'POST', headers: auth(seller.token), body: JSON.stringify({ selection: 1 }) })
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    pass('Seller selects primary bid → under_contract')
  } catch (e) { fail('Seller selects primary bid → under_contract', e) }
  try {
    const r = await api(`/listings/${listingId}/bids/${rlBidId}/select`, { method: 'POST', headers: auth(seller.token), body: JSON.stringify({ selection: 2 }) })
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    pass('Seller selects backup #1')
  } catch (e) { fail('Seller selects backup #1', e) }

  // ---- Contract + deal ----
  let contractId, dealId
  try {
    const r = await api(`/contracts/listing/${listingId}`, { method: 'POST', headers: auth(seller.token), body: JSON.stringify({ bid_id: whBidId, emd_amount: 2000, closing_days: 30 }) })
    if (![200, 201].includes(r.status)) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    contractId = r.body?.data?._id ?? r.body?.data?.id
    if (!contractId) { const d = await db().collection('contracts').findOne({ bid_id: new mongoose.Types.ObjectId(whBidId) }); contractId = d?._id }
    pass('Seller creates contract')
  } catch (e) { fail('Seller creates contract', e) }

  try {
    let r = await api(`/contracts/${contractId}/sign/seller`, { method: 'POST', headers: auth(seller.token) })
    if (!r.ok) throw new Error(`seller sign ${r.status} ${JSON.stringify(r.body)}`)
    r = await api(`/contracts/${contractId}/sign/buyer`, { method: 'POST', headers: auth(wholesaler.token) })
    if (!r.ok) throw new Error(`buyer sign ${r.status} ${JSON.stringify(r.body)}`)
    pass('Both parties sign contract')
  } catch (e) { fail('Both parties sign contract', e) }

  try {
    const d = await db().collection('deals').findOne({ contract_id: new mongoose.Types.ObjectId(contractId) })
    if (!d) throw new Error('no deal created after both signatures')
    dealId = d._id
    pass('Deal auto-created after both signatures')
  } catch (e) { fail('Deal auto-created after both signatures', e) }

  try {
    const r = await api(`/deals/${dealId}`, { headers: auth(wholesaler.token) })
    if (!r.ok) throw new Error(`${r.status}`)
    const deal = r.body?.data ?? r.body
    const dd = deal?._doc ?? deal; if (dd?.marketing_deadline || dd?.inspection_deadline) pass('Deal has wholesaler deadlines set')
    else fail('Deal has wholesaler deadlines set', new Error(`deadlines missing: ${JSON.stringify(deal).slice(0, 200)}`))
  } catch (e) { fail('Deal has wholesaler deadlines set', e) }

  try {
    const r = await api(`/deals/${dealId}/proceed-to-closing`, { method: 'POST', headers: auth(wholesaler.token) })
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    pass('Wholesaler proceeds to closing')
  } catch (e) { fail('Wholesaler proceeds to closing', e) }

  try {
    const r = await api(`/deals/${dealId}/close`, { method: 'POST', headers: auth(seller.token) })
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
    pass('Seller closes deal → closed')
  } catch (e) { fail('Seller closes deal → closed', e) }

  // ---- Adversarial / guards ----
  try {
    const r = await api('/admin/dashboard', { headers: auth(seller.token) })
    if (r.status === 403) pass('Role guard — seller blocked from /admin')
    else fail('Role guard — seller blocked from /admin', new Error(`got ${r.status}`))
  } catch (e) { fail('Role guard — seller blocked from /admin', e) }

  try {
    const r = await api(`/deals/${dealId}`, { headers: auth(realtor.token) })
    if (r.status === 403 || r.status === 404) pass('IDOR — non-party cannot read deal')
    else fail('IDOR — non-party cannot read deal', new Error(`got ${r.status}`))
  } catch (e) { fail('IDOR — non-party cannot read deal', e) }

  try {
    const r = await api('/deals/000000000000000000000000/close', { method: 'POST', headers: auth(seller.token) })
    if (r.status >= 400 && r.status < 500) pass('Close non-existent deal → 4xx (no 500)')
    else fail('Close non-existent deal → 4xx (no 500)', new Error(`got ${r.status}`))
  } catch (e) { fail('Close non-existent deal → 4xx (no 500)', e) }

  try {
    const r = await api('/users/' + seller.uid + '/score', { headers: auth(adminToken) })
    if (r.ok) pass('Score endpoint readable')
    else fail('Score endpoint readable', new Error(`${r.status} ${JSON.stringify(r.body)}`))
  } catch (e) { fail('Score endpoint readable', e) }

  const bad = [
    ['login empty', '/auth/login', '{}'],
    ['register garbage', '/auth/register', JSON.stringify({ email: 'x' })],
    ['listing bad id', '/listings/not-an-id', null],
    ['bid negative', `/listings/${listingId}/bids`, JSON.stringify({ bid_price: -5 })],
  ]
  for (const [name, path, body] of bad) {
    try {
      const r = await api(path, body === null ? { headers: auth(wholesaler.token) } : { method: 'POST', headers: auth(wholesaler.token), body })
      if (r.status === 500) fail(`No 500 on: ${name}`, new Error(JSON.stringify(r.body).slice(0, 160)))
      else pass(`No 500 on: ${name} (${r.status})`)
    } catch (e) { fail(`No 500 on: ${name}`, e) }
  }

  await mongoose.disconnect()
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  console.log(`\n────────────────────────────────\nResults: ${passed} passed, ${failed.length} failed (${results.length} total)`)
  if (failed.length) { console.log('\nFailed:'); failed.forEach((f) => console.log(`  • ${f.n}: ${f.e}`)) }
  process.exit(failed.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
