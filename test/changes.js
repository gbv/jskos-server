/* eslint-env node, mocha */
import config from "../config/index.js"
import assert, { AssertionError } from "assert"
import * as server from "../server.js"
import { setupChangesApi } from "../utils/changes.js"
import { connection } from "../utils/db.js"
import { objectTypes } from "jskos-tools"
import { assertMongoDB, dropDatabaseBeforeAndAfter, assertIndexes } from "./test-utils.js"
import WebSocket from "ws"

// map each route to its collection name and expected JSKOS type
const routes = {
  voc:          { coll: "terminologies",    type: "ConceptScheme" },
  concepts:     { coll: "concepts",         type: "Concept" },
  mappings:     { coll: "mappings",         type: "ConceptMapping" },
  concordances: { coll: "concordances",     type: "Concordance" },
  annotations:  { coll: "annotations",      type: "Annotation" },
}


// Capture console.log output
let loggedMessages = []
const originalLog = console.log

before(() => {
  console.log = (msg) => loggedMessages.push(msg)
})

after(() => {
  console.log = originalLog
})


describe("Change‐Streams API setup", () => {

  it("should skip registering when enableChangesApi is false", async () => {
    // ensure flag is off
    config.changesApi.enableChangesApi = false

    // Clear any previous logs
    loggedMessages.length = 0

    // call the exported setup function
    await setupChangesApi(server.app)

    // assert our early‐return message was logged
    loggedMessages.includes("Change API is disabled by configuration.")
  })

  it("throws ConfigurationError when enabled but replica set unreachable", async () => {
  // turn the flag on
    config.changesApi.enableChangesApi = true

    // stub out the replica‐set check to simulate unreachable
    const origWait = server.db.waitForReplicaSet
    server.db.waitForReplicaSet = async () => false

    try {
      await setupChangesApi(server.app)
    } catch (err) {
    // verify we got the right error
      assert.ok(
        err instanceof AssertionError,
        `Expected ConfigurationError but got ${err.constructor.name}`,
      )
      assert.strictEqual(
        err.message,
        "Change API enabled, but MongoDB replica set did not initialize in time.",
      )
    } finally {
    // restore original
      server.db.waitForReplicaSet = origWait
    }
  })

})

describe("WebSocket Change‐Streams (integration)", () => {
  assertMongoDB()
  dropDatabaseBeforeAndAfter()
  assertIndexes()


  // Tell the server to enable changes‐API…
  before(async () => {
    config.changesApi.enableChangesApi = true
    // re‐run the setup so registerChangeRoutes() actually wires up the /…/changes endpoints
    await setupChangesApi(server.app)
  })

  // generate tests for each route
  for (const [route, info] of Object.entries(routes)) {
    lifecycleTests(route, info)
  }

})

function lifecycleTests(route, { coll, type }) {
  const uriBase = `urn:test:${route}`  
  const typeUri  = objectTypes[type].type?.[0]

  describe(`${route}/changes`, () => {
    it("emits create", done => {
      const ws = new WebSocket(`ws://localhost:${config.port}/${route}/changes`)
      ws.on("open", async () => {
        await connection.db.collection(coll).insertOne({
          uri:       `${uriBase}:1`,
          type:      typeUri,
          prefLabel: { en: ["A"] },
        })
      })
      ws.on("message", raw => {
        const evt = JSON.parse(raw)
        try {
          assert.strictEqual(evt.type, "create")
          assert.strictEqual(evt.objectType, type)
          assert.deepStrictEqual(evt.document.prefLabel.en, ["A"])
          ws.close()
          done()
        } catch (err) {
          done(err)
        }
      })
      ws.on("error", err => done(err))
    })

    it("emits update", done => {
      const ws = new WebSocket(`ws://localhost:${config.port}/${route}/changes`)
      ws.on("open", async () => {
        const { insertedId } = await connection.db.collection(coll).insertOne({
          uri:       `${uriBase}:2`,
          type:      typeUri,
          prefLabel: { en: ["B"] },
        })
        await connection.db.collection(coll).updateOne(
          { _id: insertedId },
          { $set: { prefLabel: { en: ["BB"] } } },
        )
      })
      ws.on("message", raw => {
        const evt = JSON.parse(raw)
        if (evt.type !== "update") {
          return
        }
        try {
          assert.strictEqual(evt.objectType, type)
          assert.deepStrictEqual(evt.document.prefLabel.en, ["BB"])
          ws.close()
          done()
        } catch (err) {
          done(err)
        }
      })
      ws.on("error", err => done(err))
    })

    it("emits delete", done => {
      const ws = new WebSocket(`ws://localhost:${config.port}/${route}/changes`)
      ws.on("open", async () => {
        const { insertedId } = await connection.db.collection(coll).insertOne({
          uri:       `${uriBase}:3`,
          type:      typeUri,
          prefLabel: { en: ["C"] },
        })
        await connection.db.collection(coll).deleteOne({ _id: insertedId })
      })
      ws.on("message", raw => {
        const evt = JSON.parse(raw)
        if (evt.type !== "delete") {
          return
        }
        try {
          // on delete fullDocument is omitted
          assert.strictEqual(evt.document, undefined)
          ws.close()
          done()
        } catch (err) {
          done(err)
        }
      })
      ws.on("error", err => done(err))
    })
  })
}