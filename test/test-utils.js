import assert from "node:assert"
import mongoose from "mongoose"
import { MongoMemoryServer, MongoMemoryReplSet } from "mongodb-memory-server"
import { byType as services } from "../services/index.js"


let mongod

/**
 * Starts an in-memory MongoDB server (standalone or replica set).
 */
export async function setupInMemoryMongo(opts = { replSet: false }) {
  if (opts.replSet) {
    mongod = new MongoMemoryReplSet({ replSet: { count: 1 } })
  } else {
    mongod = new MongoMemoryServer()
  }
  await mongod.start()
  const uri = mongod.getUri()

  await mongoose.disconnect().catch(() => {})
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
  })

  return uri
}


/**
 * Stops Mongoose and in-memory server.
 */
export async function teardownInMemoryMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
  if (mongod) {
    await mongod.stop()
  }
}


/**
 * Drop the database.
 */
export async function dropDatabase() {
  const conn = mongoose.connection
  // If not connected at all, skip drop
  if (conn.readyState === 0) {
    console.log("    ⚠ No connection, skipping drop")
    return
  }
  // If connecting, wait until connected or timeout
  if (conn.readyState !== 1) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for DB connection")), 5000)
      conn.once("connected", () => {
        clearTimeout(timeout); resolve() 
      })
      conn.once("error", (err) => {
        clearTimeout(timeout); reject(err) 
      })
    })
  }
  try {
    await conn.db.dropDatabase()
    console.log("    ✓ Dropped in-memory database")
  } catch (err) {
    console.error("    x Error: Dropping database failed.", err)
    throw err
  }
}


/* process.on("SIGINT", () => {
  dropDatabase(() => process.exit(1))
}) */

/**
 * Mocha hooks: drop DB before and after each suite.
 */
export function dropDatabaseBeforeAndAfter() {
  before(async () => {
    await dropDatabase() 
  })
  after(async ()  => {
    await dropDatabase() 
  })
}

/**
 * Asserts that Mongoose is connected.
 */
export function assertMongoDB() {
  describe("MongoDB Connection", () => {
    it("should connect successfully", (done) => {
      const conn = mongoose.connection
      if (conn.readyState === 1) {
        return done()
      }
      conn.once("connected", () => done())
      conn.once("error", (err) => done(err))
    })
  })
}


/**
 * Ensure that all JSKOS collections exist and have their indexes.
 * This replaces running `import.js --indexes`.
 */
export async function createCollectionsAndIndexes() {
  const collNames = ["terminologies","concepts","concordances","mappings","annotations"]
  // 1. Create an empty collection if it doesn't exist
  for (const name of collNames) {
    const exists = await mongoose.connection.db
      .listCollections({ name })
      .hasNext()
    if (!exists) {
      await mongoose.connection.db.createCollection(name)
    }
  }
  // 2. Call each service's createIndexes() method
  for (const type of Object.keys(services)) {
    // services[type].createIndexes() should invoke e.g. Model.createIndexes()
    await services[type].createIndexes()
  }
}


/**
 * Verifies that indexes exist on all relevant collections.
 */
export async function assertIndexes() {
  it("should have at least default indexes", async () => {
    const collections = ["terminologies", "concepts", "concordances", "mappings", "annotations"]
    for (const name of collections) {
      // ensure collection exists
      const exists = await mongoose.connection.db.listCollections({ name }).hasNext()
      if (!exists) {
        await mongoose.connection.db.createCollection(name)
      }
      const info = await mongoose.connection.db.collection(name).indexInformation()
      // Expect at least the _id index
      assert.ok(info._id_, `Missing _id index on ${name}`)
      // Optionally check other indexes here
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
import * as anystream from "json-anystream"

export async function arrayToStream(array) {
  const readable = new Stream.Readable({ objectMode: true })
  array.forEach(item => readable.push(JSON.stringify(item) + "\n"))
  readable.push(null)
  return anystream.make(readable, "ndjson")
}
