// SQLite-only web metadata. PostgreSQL uses versioned Supabase migrations.
function ensureWebSchema(db) {
  require("./automaticos.cjs").ensureAutomaticosSchema(db);
  db.exec("CREATE TABLE IF NOT EXISTS _web_requests (id TEXT PRIMARY KEY, hash TEXT NOT NULL, result TEXT NOT NULL)");
}
module.exports = { ensureWebSchema };
