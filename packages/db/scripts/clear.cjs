const postgres = require('postgres');
const fs = require('fs');
const path = require('path');
const net = require('net');

const envPath = path.resolve(__dirname, '../../../.env');

// Parse .env if variables not set
const envVars = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    envVars[key.trim()] = rest.join('=').trim().replace(/(^['"]|['"]$)/g, '');
  }
}

const dbUrl =
  process.env.DATABASE_URL ||
  envVars.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/lunaria';

const redisHost =
  process.env.REDIS_HOST || envVars.REDIS_HOST || 'localhost';
const redisPort = parseInt(
  process.env.REDIS_PORT || envVars.REDIS_PORT || '6379',
  10,
);

const sql = postgres(dbUrl);

// Flushes Redis using zero-dependency raw TCP socket
function flushRedis(host, port) {
  return new Promise((resolve) => {
    const client = net.createConnection({ host, port }, () => {
      client.write('*1\r\n$8\r\nFLUSHALL\r\nQUIT\r\n');
    });

    client.on('data', () => {
      client.end();
      resolve(true);
    });

    client.on('error', (err) => {
      console.warn(`   ⚠️ Redis at ${host}:${port} skipped (${err.message})`);
      resolve(false);
    });

    setTimeout(() => {
      client.destroy();
      resolve(false);
    }, 2000);
  });
}

const DEFAULT_CATEGORIES = [
  { name: 'Rent & Mortgage', group: 'Living Expenses', color: '#6366f1', icon: 'home', isSystem: true },
  { name: 'Utilities', group: 'Living Expenses', color: '#0ea5e9', icon: 'zap', isSystem: true },
  { name: 'Groceries', group: 'Food & Lifestyle', color: '#10b981', icon: 'shopping-cart', isSystem: true },
  { name: 'Dining & Restaurants', group: 'Food & Lifestyle', color: '#f59e0b', icon: 'utensils', isSystem: true },
  { name: 'Shopping & Electronics', group: 'Discretionary', color: '#ec4899', icon: 'tag', isSystem: true },
  { name: 'Travel & Transport', group: 'Discretionary', color: '#8b5cf6', icon: 'plane', isSystem: true },
  { name: 'Entertainment & Streaming', group: 'Discretionary', color: '#06b6d4', icon: 'tv', isSystem: true },
  { name: 'Health & Medical', group: 'Living Expenses', color: '#ef4444', icon: 'heart-pulse', isSystem: true },
  { name: 'Paycheck / Income', group: 'Income', color: '#34d399', icon: 'wallet', isSystem: true },
  { name: 'Investments & Transfers', group: 'Financial', color: '#a855f7', icon: 'trending-up', isSystem: true },
];

async function clear() {
  console.log('\n========================================================');
  console.log('🧹 LUNARIA: Resetting Database & Redis Queues from Scratch');
  console.log('========================================================\n');

  // 1. PostgreSQL Database Purge
  console.log('📦 1. Purging PostgreSQL Database:');
  const txCount = await sql`DELETE FROM transactions RETURNING id;`;
  const holdCount = await sql`DELETE FROM security_holdings RETURNING id;`;
  const snapCount = await sql`DELETE FROM price_snapshots RETURNING time;`;
  const accCount = await sql`DELETE FROM accounts RETURNING id;`;
  const itemCount = await sql`DELETE FROM plaid_items RETURNING id;`;
  const auditCount = await sql`DELETE FROM audit_logs RETURNING id;`;
  const customCatCount = await sql`DELETE FROM categories WHERE is_system = false RETURNING id;`;
  await sql`DELETE FROM user_category_exclusions;`;
  await sql`DELETE FROM category_rules;`;

  console.log(`   ✓ Deleted ${txCount.length} transaction(s)`);
  console.log(`   ✓ Deleted ${holdCount.length} security holding(s)`);
  console.log(`   ✓ Deleted ${snapCount.length} price snapshot(s)`);
  console.log(`   ✓ Deleted ${accCount.length} bank account(s)`);
  console.log(`   ✓ Deleted ${itemCount.length} Plaid connection(s)`);
  console.log(`   ✓ Deleted ${auditCount.length} audit log(s)`);
  console.log(`   ✓ Deleted ${customCatCount.length} custom user category/categories`);

  // Ensure system default categories exist
  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await sql`SELECT id FROM categories WHERE name = ${cat.name} LIMIT 1;`;
    if (existing.length === 0) {
      await sql`
        INSERT INTO categories (name, "group", color, icon, is_system)
        VALUES (${cat.name}, ${cat.group}, ${cat.color}, ${cat.icon}, true)
      `;
    }
  }
  console.log('   ✓ Verified 10 system default categories');

  // 2. Redis Cache & Queue Purge
  console.log('\n⚡ 2. Purging Redis Queues & Cache:');
  const redisSuccess = await flushRedis(redisHost, redisPort);
  if (redisSuccess) {
    console.log(`   ✓ Flushed all Redis keys & BullMQ queues on ${redisHost}:${redisPort} (FLUSHALL)`);
  } else {
    console.log(`   ℹ️ Redis not reachable on ${redisHost}:${redisPort} (skipped)`);
  }

  console.log('\n========================================================');
  console.log('✅ COMPLETE: Database and queues are now clean & fresh.');
  console.log('========================================================\n');

  await sql.end();
  process.exit(0);
}

clear().catch(async (err) => {
  console.error('\n❌ Failed to clear database/redis:', err);
  await sql.end();
  process.exit(1);
});
