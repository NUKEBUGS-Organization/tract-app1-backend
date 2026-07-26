/**
 * Seed canonical camelCase test users into the shared `users` collection.
 *
 * Usage:
 *   npx ts-node scripts/seed-test-users.ts
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import * as bcrypt from 'bcryptjs';

const URI = process.env.MONGODB_URI?.trim();
if (!URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

const PASSWORD = 'Test1234!';
const BCRYPT_ROUNDS = 12;

type SeedUser = {
  email: string;
  role: string;
  phone: string;
};

const SEED_USERS: SeedUser[] = [
  {
    email: 'azibaliansari311@gmail.com',
    role: 'wholesaler',
    phone: '+17326403465',
  },
  {
    email: 'realtor@tract-test.com',
    role: 'realtor',
    phone: '+17019976600',
  },
  {
    email: 'seller@tract-test.com',
    role: 'seller',
    phone: '+17759865200',
  },
  {
    email: 'buyer@tract-test.com',
    role: 'buyer',
    phone: '+17759802006',
  },
  {
    email: 'titlerep@tract-test.com',
    role: 'title_rep',
    phone: '+13015550100',
  },
  {
    email: 'tractadmin@tract-test.com',
    role: 'admin',
    phone: '+19995550100',
  },
];

function fullNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .replace(/[._+-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildUserDoc(seed: SeedUser, passwordHash: string) {
  const now = new Date();
  return {
    email: seed.email.toLowerCase().trim(),
    phone: seed.phone,
    passwordHash,
    role: seed.role,
    stateCode: 'TX',
    dob: new Date('1995-01-01T00:00:00.000Z'),
    fullName: fullNameFromEmail(seed.email),
    kycStatus: 'approved',
    kycVerifiedAt: now,
    kycProvider: null,
    bankVerified: false,
    bankVerifiedAt: null,
    bankProvider: null,
    reliabilityScore: 100,
    professionalScore: 100,
    restrictionStatus: 'normal',
    scoreRestrictedUntil: null,
    isBanned: false,
    banReason: null,
    banExpiresAt: null,
    lastActiveAt: null,
    currentSessionId: null,
    deletedAt: null,
    licenseNumber: '',
    brokerageName: '',
    managingBroker: '',
    officeAddress: '',
    commissionPct: 0,
    defaultAgencyRole: null,
    defaultFeePaidBy: null,
    proofOfActivityUrl: null,
    proofOfActivityUploadedAt: null,
    linkedInUrl: '',
    app1_inRestrictedState: false,
    app1_activeDealsCount: 0,
    app1_totalDealsClosed: 0,
    app1_lastContractSecuredAt: null,
    app1_maxActiveDeals: 1,
    app1_reactivationFeePending: false,
    app1_platformFeePaid: false,
    app1_totalPlatformFeesPaid: 0,
    app1_linkedUserId: null,
    app2_isVettedBuyer: false,
    app2_vettedAt: null,
    app2_activeDealsCount: 0,
    app2_totalDealsClosed: 0,
    app2_lastContractSecuredAt: null,
    app2_reactivationFeePending: false,
    app2_platformFeePaid: false,
    app2_totalPlatformFeesPaid: 0,
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  console.log(`Connecting to ${URI!.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);

  const client = new MongoClient(URI!);
  await client.connect();
  const users = client.db().collection('users');
  const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

  const created: { email: string; role: string }[] = [];

  for (const seed of SEED_USERS) {
    const email = seed.email.toLowerCase().trim();
    await users.deleteMany({ email });
    // Also clear phone collisions so unique phone index does not block re-seed
    await users.deleteMany({ phone: seed.phone });

    await users.insertOne(buildUserDoc(seed, passwordHash));
    created.push({ email, role: seed.role });
    console.log(`Seeded ${email} (${seed.role})`);
  }

  console.log('\nCreated users:');
  for (const row of created) {
    console.log(`  ${row.email} — ${row.role}`);
  }
  console.log(`\nPassword for all: ${PASSWORD}`);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
