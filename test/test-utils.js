const server = require("../server")
const assert = require("assert")

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

function assertMongoDB() {
  /**
   * Database suite to make sure the following test suits have access.
   */
  describe("MongoDB", () => {

    it("should connect to database successfully", (done) => {
      if (server.db.readyState === 1) {
        done()
      } else {
        server.db.on("connected", () => done())
        server.db.on("error", (error) => done(error))
      }
    })

  })
}

function assertIndexes() {
  it("should create indexes", async () => {
    // Create indexes
    await exec("NODE_ENV=test ./bin/import.js --indexes")
    for (let collection of ["terminologies", "concepts", "concordances", "mappings", "annotations"]) {
      const result = await server.db.collection(collection).indexInformation()
      // There should be more than the _id, uri, and identifier index
      // TODO: Adjust so that the exact indexes can be checked
      assert(Object.keys(result).length >= 3)
    }
  })
}

const cpexec = require("child_process").exec
/**
 * A wrapper around child_process' exec function for async/await.
 *
 * @param {*} command
 * @param {*} options
 */
async function exec(command, options) {
  return new Promise((resolve, reject) => {
    cpexec(command, options || {}, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        return reject(error)
      }
      resolve(stdout)
    })
  })
}

module.exports = {
  assertIndexes,
  assertMongoDB,
  dropDatabase,
  dropDatabaseBeforeAndAfter,
  exec,
}
