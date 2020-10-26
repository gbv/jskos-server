/* eslint-env node, mocha */
const server = require("../server")
const assert = require("assert")

const { assertIndexes, assertMongoDB, dropDatabaseBeforeAndAfter, exec } = require("./test-utils")

describe("Import and Reset Script", () => {

  assertMongoDB()
  dropDatabaseBeforeAndAfter()

  describe("Import Script", () => {

    assertIndexes()

    it("should import terminologies", async () => {
      // Add vocabularies to database
      await exec("NODE_ENV=test ./bin/import.js schemes ./test/terminologies/terminologies.json")
      const results = await server.db.collection("terminologies").find({}).toArray()
      assert.strictEqual(results.length, 2)
    })

    it("should import concepts", async () => {
      // Add concepts to database
      await exec("NODE_ENV=test ./bin/import.js concepts ./test/concepts/concepts-ddc-6-60-61-62.json")
      const results = await server.db.collection("concepts").find({}).toArray()
      assert.strictEqual(results.length, 4)
    })

    it("should import concordances", async () => {
      // Add concordances to database
      await exec("NODE_ENV=test ./bin/import.js concordances ./test/concordances/concordances.ndjson")
      const results = await server.db.collection("concordances").find({}).toArray()
      assert.strictEqual(results.length, 2)
    })

    it("should import mappings", async () => {
      // Add mappings to database
      await exec("NODE_ENV=test ./bin/import.js mappings ./test/mappings/mapping-ddc-gnd.json")
      const results = await server.db.collection("mappings").find({}).toArray()
      results.length.should.be.eql(3)
    })

    it("should import annotations", async () => {
      // Import one annotation
      let results
      results = await server.db.collection("annotations").find({}).toArray()
      results.length.should.be.eql(0)
      await exec("NODE_ENV=test ./bin/import.js annotations ./test/annotations/annotation.json")
      results = await server.db.collection("annotations").find({}).toArray()
      results.length.should.be.eql(1)
    })

  })

  describe("Reset Script", () => {

    it("should clear the database", async () => {
      // Clear database
      await exec("yes | NODE_ENV=test ./bin/reset.js")
      for (let collection of ["concepts", "mappings", "terminologies"]) {
        const result = await server.db.collection(collection).find({}).toArray()
        assert.strictEqual(result.length, 0)
      }
    })

  })

})
