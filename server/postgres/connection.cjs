"use strict";
const fs = require("node:fs");
function connectionConfig(env = process.env) {
  if (!env.DATABASE_URL)
    throw new Error("Falta DATABASE_URL en el archivo privado .env.");
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL debe ser una conexión PostgreSQL.");
  if (!url.password || url.password.includes("[YOUR-PASSWORD]"))
    throw new Error("Completa la contraseña de PostgreSQL en DATABASE_URL.");
  // pg overrides the ssl object if these parameters remain in the URL.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  return {
    connectionString: url.toString(),
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ...(env.PG_CA_FILE
            ? { ca: fs.readFileSync(env.PG_CA_FILE, "utf8") }
            : {}),
        },
    connectionTimeoutMillis: 15000,
    application_name: "ansorito-web",
    statement_timeout: 60000,
  };
}
module.exports = { connectionConfig };
