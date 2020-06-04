const server = require("../server")

/**
 * Drops the current database. ONLY USE IN TEST SUITS!
 *
 * @param {Function} done callback function with error as parameter
 */
function dropDatabase(done) {
  let internalDone = (error) => {
    if (error) {
      console.error("    x Error: Dropping database failed.")
    } else {
      console.log("    ✓ Dropped database")
    }
    done(error)
  }
  if (server.db.readyState === 1) {
    server.db.dropDatabase(internalDone)
  } else {
    server.db.on("connected", () => server.db.dropDatabase(internalDone))
  }
}

process.on("SIGINT", () => {
  dropDatabase(() => process.exit(1))
})

function dropDatabaseBeforeAndAfter() {
  before(dropDatabase)
  after(dropDatabase)
}

module.exports = {
  dropDatabase,
  dropDatabaseBeforeAndAfter,
}
