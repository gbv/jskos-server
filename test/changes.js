/* eslint-env node, mocha */
import config from "../config/index.js"
import { connection } from "../utils/db.js"
import { objectTypes } from "jskos-tools"
import { assertMongoDB, dropDatabaseBeforeAndAfter, assertIndexes } from "./test-utils.js"
import assert from "assert"
import WebSocket from "ws"


// map each route to its collection name and expected JSKOS type
const routes = {
  voc:          { coll: "terminologies",    type: "ConceptScheme" },
  concepts:     { coll: "concepts",         type: "Concept" },
  mappings:     { coll: "mappings",         type: "ConceptMapping" },
  concordances: { coll: "concordances",     type: "Concordance" },
  annotations:  { coll: "annotations",      type: "Annotation" },
}

describe("WebSocket Change‐Streams (integration)", () => {
  assertMongoDB()
  dropDatabaseBeforeAndAfter()
  assertIndexes()


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


