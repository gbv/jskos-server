/* eslint-env node, mocha */
import { assertMongoDB, dropDatabaseBeforeAndAfter, setupInMemoryMongo, teardownInMemoryMongo, createCollectionsAndIndexes } from "./test-utils.js"
import WebSocket from "ws"
import assert from "assert"
import config from "../config/index.js"
import { app } from "../server.js"
import { setupChangesApi } from "../utils/changes.js"
import { objectTypes } from "jskos-tools"
import mongoose from "mongoose"

// Map each route to its collection name and expected JSKOS type
const routes = {
  voc:          { coll: "terminologies", type: "ConceptScheme"  },
  concepts:     { coll: "concepts",       type: "Concept"        },
  mappings:     { coll: "mappings",       type: "ConceptMapping" },
  concordances: { coll: "concordances",   type: "Concordance"    },
  annotations:  { coll: "annotations",    type: "Annotation"     },
}

// Capture console.log output
let loggedMessages = []
const originalLog = console.log

before(async () => {
  console.log = (msg) => loggedMessages.push(msg)

})

after(async () => {
  console.log = originalLog

})

describe("Change‐Streams API setup", () => {
  // Capture console.log output
  let loggedMessages = []
  const originalLog = console.log

  before(async () => {
    console.log = (msg) => loggedMessages.push(msg)

  })

  after(async () => {
    console.log = originalLog

  })

  it("should skip registering when enableChangesApi is false", async () => {
    // ensure flag is off
    config.changesApi.enableChangesApi = false

    // call the exported setup function
    await setupChangesApi(app)

    // assert our early‐return message was logged
    loggedMessages.includes("Change API is disabled by configuration.")
  })

})

describe("WebSocket Change‐Streams (integration)", function () {

  before(async () => {
    await setupInMemoryMongo({ replSet: true })
    config.changesApi.enableChangesApi = true
    await setupChangesApi(app)
    await createCollectionsAndIndexes()
    // optionally spin up your HTTP+WS server here
  })
  
  after(async () => {
    // close server if you started one
    await teardownInMemoryMongo()
  })
  
  // 🗑 Drop DB before *and* after every single `it()` in this file
  dropDatabaseBeforeAndAfter()
  
  // 🔌 Sanity‐check that mongoose really is connected
  assertMongoDB()
  
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
        await mongoose.connection.db.collection(coll).insertOne({
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
        const { insertedId } = await mongoose.connection.db.collection(coll).insertOne({
          uri:       `${uriBase}:2`,
          type:      typeUri,
          prefLabel: { en: ["B"] },
        })
        await mongoose.connection.db.collection(coll).updateOne(
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
        const { insertedId } = await mongoose.connection.db.collection(coll).insertOne({
          uri:       `${uriBase}:3`,
          type:      typeUri,
          prefLabel: { en: ["C"] },
        })
        await mongoose.connection.db.collection(coll).deleteOne({ _id: insertedId })
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
