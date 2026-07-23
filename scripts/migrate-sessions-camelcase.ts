/**
 * One-off: rename App 1 session document fields snake_case → camelCase
 * (match App 2 Session schema).
 *
 * Usage:
 *   DRY_RUN=1 MONGODB_URI=mongodb://... npx ts-node -r tsconfig-paths/register scripts/migrate-sessions-camelcase.ts
 *   MONGODB_URI=mongodb://... npx ts-node -r tsconfig-paths/register scripts/migrate-sessions-camelcase.ts
 *
 * Or with node after compile / via:
 *   DRY_RUN=1 MONGODB_URI=... node -r ts-node/register scripts/migrate-sessions-camelcase.ts
 */
/* eslint-disable no-console */

import { MongoClient } from 'mongodb';

const URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/tract';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const RENAME_MAP = {
  session_id: 'sessionId',
  refresh_token_hash: 'refreshTokenHash',
  is_blacklisted: 'isBlacklisted',
  expires_at: 'expiresAt',
  deleted_at: 'deletedAt',
} as const;

async function main() {
  console.log(`Connecting to ${URI}`);
  console.log(DRY_RUN ? 'DRY RUN — no writes' : 'LIVE — applying $rename');

  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db();
  const sessions = db.collection('sessions');

  const beforeLegacy = await sessions.countDocuments({
    session_id: { $exists: true },
  });
  const beforeTotal = await sessions.countDocuments({});
  const beforeCamel = await sessions.countDocuments({
    sessionId: { $exists: true },
  });

  console.log('Before:');
  console.log(`  total sessions:              ${beforeTotal}`);
  console.log(`  with session_id (legacy):    ${beforeLegacy}`);
  console.log(`  with sessionId (camelCase):  ${beforeCamel}`);

  if (beforeLegacy === 0) {
    console.log('Nothing to rename (no documents with session_id).');
    await client.close();
    return;
  }

  if (DRY_RUN) {
    console.log(
      `Would $rename on ${beforeLegacy} document(s):`,
      JSON.stringify(RENAME_MAP),
    );
  } else {
    const result = await sessions.updateMany(
      { session_id: { $exists: true } },
      {
        $rename: {
          session_id: 'sessionId',
          refresh_token_hash: 'refreshTokenHash',
          is_blacklisted: 'isBlacklisted',
          expires_at: 'expiresAt',
          deleted_at: 'deletedAt',
        },
      },
    );
    console.log('updateMany result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  }

  const afterLegacy = await sessions.countDocuments({
    session_id: { $exists: true },
  });
  const afterCamel = await sessions.countDocuments({
    sessionId: { $exists: true },
  });
  const afterTotal = await sessions.countDocuments({});

  console.log('After:');
  console.log(`  total sessions:              ${afterTotal}`);
  console.log(`  with session_id (legacy):    ${afterLegacy}`);
  console.log(`  with sessionId (camelCase):  ${afterCamel}`);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
