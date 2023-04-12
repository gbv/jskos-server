import * as server from "../server.js"
import assert from "node:assert"

/**
 * Drops the current database. ONLY USE IN TEST SUITS!
 *
 * @param {Function} done callback function with error as parameter
 */
export async function dropDatabase() {

  if (server.db.readyState !== 1) {
    // Wait for connection
    await new Promise((resolve) => {
      server.db.on("connected", () => resolve())
    })
  }

  try {
    await server.db.dropDatabase()
    console.log("    ✓ Dropped database")
  } catch (error) {
    console.error("    x Error: Dropping database failed.")
    throw error
  }

}

process.on("SIGINT", () => {
  dropDatabase(() => process.exit(1))
})

export function dropDatabaseBeforeAndAfter() {
  before(dropDatabase)
  after(dropDatabase)
}

export function assertMongoDB() {
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

export function assertIndexes() {
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

import { exec as cpexec } from "node:child_process"
/**
 * A wrapper around child_process' exec function for async/await.
 *
 * @param {*} command
 * @param {*} options
 */
export async function exec(command, options) {
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

import Stream from "node:stream"
import anystream from "json-anystream"

export async function arrayToStream(array) {
  const readable = new Stream.Readable({ objectMode: true })
  array.forEach(item => readable.push(JSON.stringify(item) + "\n"))
  readable.push(null)
  return anystream.make(readable, "ndjson")
}
