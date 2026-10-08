// Preserve the desktop controller contract; select infrastructure explicitly.
const engine = process.env.ANSORITO_DB_ENGINE || "sqlite";
if (!["postgres", "sqlite"].includes(engine))
  throw Error("ANSORITO_DB_ENGINE debe ser postgres o sqlite.");
module.exports =
  engine === "postgres"
    ? require("../../../server/postgres/database.cjs")
    : require("./db.sqlite.js");
