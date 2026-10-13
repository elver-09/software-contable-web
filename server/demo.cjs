'use strict';
// Dedicated local demo: never reuse the accounting workspace or cloud secrets.
const path = require('node:path');
for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'DATABASE_URL', 'PG_CA_FILE', 'SIRE_MASTER_KEY']) delete process.env[key];
Object.assign(process.env, {
  ANSORITO_DB_ENGINE: 'sqlite', ANSORITO_SQLITE_MODE: 'demo',
  ANSORITO_DATA_DIR: path.join(__dirname, '../data/demo'), HOST: '127.0.0.1',
  PORT: process.env.ANSORITO_DEMO_PORT || '4182', AUTO_EXCHANGE_RATE: '0',
});
require('./index.cjs').start().catch(error => { console.error(error.message); process.exitCode = 1; });
