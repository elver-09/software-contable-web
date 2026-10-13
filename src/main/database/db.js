// Preserve the desktop controller contract; select infrastructure explicitly.
const engine = require('../../../server/runtime-config.cjs').databaseEngine();
module.exports =
  engine === "postgres"
    ? require("../../../server/postgres/database.cjs")
    : require("./db.sqlite.js");
