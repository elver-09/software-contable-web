'use strict';

function databaseEngine(env = process.env) {
  const engine = env.ANSORITO_DB_ENGINE || 'postgres';
  if (!['postgres', 'sqlite'].includes(engine)) throw Error('ANSORITO_DB_ENGINE debe ser postgres o sqlite.');
  if (engine === 'sqlite' && !['demo', 'test'].includes(env.ANSORITO_SQLITE_MODE)) {
    throw Error('El inicio normal requiere PostgreSQL. Para revisar datos de prueba usa pnpm start:demo.');
  }
  if (engine === 'sqlite' && env.NODE_ENV === 'production') throw Error('SQLite no está permitido en producción.');
  return engine;
}

function validateServerConfig(env = process.env) {
  const engine = databaseEngine(env);
  if (engine === 'postgres') {
    for (const name of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SIRE_MASTER_KEY']) {
      if (!String(env[name] || '').trim()) throw Error(`Falta ${name}. Completa la configuración privada antes de iniciar.`);
    }
    // Validate without including connection strings or credentials in errors.
    try { require('./postgres/connection.cjs').connectionConfig(env); }
    catch { throw Error('Revisa DATABASE_URL y PG_CA_FILE: la conexión PostgreSQL no está configurada correctamente.'); }
  }
  if (engine === 'sqlite' && env.ANSORITO_SQLITE_MODE === 'demo') {
    if (env.SUPABASE_URL || env.SUPABASE_PUBLISHABLE_KEY || env.DATABASE_URL) throw Error('La demostración SQLite no debe usar credenciales de Supabase.');
    if (env.HOST && env.HOST !== '127.0.0.1') throw Error('La demostración solo puede iniciarse en 127.0.0.1.');
  }
  if (Boolean(env.SUPABASE_URL) !== Boolean(env.SUPABASE_PUBLISHABLE_KEY)) throw Error('Configure URL y clave pública de Supabase juntas.');
  if (env.SUPABASE_URL && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL)) throw Error('URL Supabase inválida.');
  if (env.SUPABASE_URL && String(env.SIRE_MASTER_KEY || '').length < 32) throw Error('Falta SIRE_MASTER_KEY válida para proteger credenciales SUNAT.');
  return engine;
}

async function verifyPostgresStartup() {
  const { Client } = require('pg');
  const client = new Client(require('./postgres/connection.cjs').connectionConfig());
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const applied = await client.query('SELECT version, checksum FROM ansorito.schema_migrations');
    const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
    const folder = path.join(__dirname, '../supabase/migrations');
    for (const file of fs.readdirSync(folder).filter(f => f.endsWith('.sql'))) {
      const expected = crypto.createHash('sha256').update(fs.readFileSync(path.join(folder, file))).digest('hex');
      if (!applied.rows.some(row => row.version === file && row.checksum === expected)) {
        throw Error('La estructura PostgreSQL está pendiente o difiere del proyecto. Ejecuta pnpm db:migrate antes de iniciar.');
      }
    }
    await client.query('ROLLBACK');
  } catch (error) {
    if (error.message.startsWith('La estructura PostgreSQL')) throw error;
    throw Error('No se pudo verificar PostgreSQL. Revisa la conexión y las migraciones. El sistema no cambiará a SQLite.');
  } finally { await client.end(); }
}

module.exports = { databaseEngine, validateServerConfig, verifyPostgresStartup };
