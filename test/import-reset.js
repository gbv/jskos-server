/* eslint-env node, mocha */
import * as server from "../server.js"
import assert from "node:assert"

import { assertIndexes, assertMongoDB, dropDatabaseBeforeAndAfter, exec } from "./test-utils.js"

describe("Import and Reset Script", () => {

  assertMongoDB()
  dropDatabaseBeforeAndAfter()

  describe("Import Script", () => {

    it("should create index on one type", async () => {
      const type = "mappings"
      await exec("NODE_ENV=test ./bin/import.js --indexes " + type)
      for (let collection of ["terminologies", "concepts", "concordances", "mappings", "annotations"]) {
        try {
          const result = await server.db.collection(collection).indexInformation()
          if (collection == type) {
            assert(Object.keys(result).length >= 3)
          } else {
            assert.fail(`Expected index information to fail for ${collection}.`)
          }
        } catch (error) {
          if (collection == type) {
            assert.fail(`Expected index information to return result for ${collection}.`)
          }
        }
      }
    })

    assertIndexes()

    it("should import terminologies", async () => {
      // Add vocabularies to database
      await exec("NODE_ENV=test ./bin/import.js schemes ./test/terminologies/terminologies.json")
      const results = await server.db.collection("terminologies").find({}).toArray()
      assert.strictEqual(results.length, 2)
    })

    it("should import concepts", async () => {
      // Add concepts to database
      const stdout = await exec("NODE_ENV=test ./bin/import.js -q concepts ./test/concepts/concepts-ddc-6-60-61-62.json")
      // Testing -q as well
      assert.strictEqual(stdout, "", "There was output despite option -q (quiet).")
      const results = await server.db.collection("concepts").find({}).toArray()
      assert.strictEqual(results.length, 4)
    })

    it("should import concepts from file with --format option", async () => {
      const filename = "conceptNoFileEnding"
      const command = `NODE_ENV=test ./bin/import.js concepts ./test/concepts/${filename}`
      // First, without -f
      try {
        await exec(command)
        assert.fail("Expected import without file ending and without format option to fail.")
      } catch (error) {
        // Ignore error
      }
      // Then with -f
      await exec(`${command} --format json`)
      const results = await server.db.collection("concepts").find({ uri: `uri:${filename}` }).toArray()
      assert.strictEqual(results.length, 1)
    })

    it("should import concordances", async () => {
      // Add concordances to database
      await exec("NODE_ENV=test ./bin/import.js concordances ./test/concordances/concordances.ndjson")
      const results = await server.db.collection("concordances").find({}).toArray()
      assert.strictEqual(results.length, 2)
    })

    it("should not import mappings without scheme", async () => {
      await exec("NODE_ENV=test ./bin/import.js mappings ./test/mappings/mapping-ddc-gnd-noScheme.json")
      const results = await server.db.collection("mappings").find({}).toArray()
      assert.strictEqual(results.length, 0)
    })

    it("should import mappings", async () => {
      // Add mappings to database
      await exec("NODE_ENV=test ./bin/import.js mappings ./test/mappings/mapping-ddc-gnd.json")
      const results = await server.db.collection("mappings").find({}).toArray()
      assert.strictEqual(results.length, 3)
    })

    it("should import mappings into a concordance (and set fromScheme/toScheme for the mappings)", async () => {
      let results
      const concordance = "http://coli-conc.gbv.de/concordances/ddc_rvk_medizin"
      const query = { "partOf.uri": concordance }
      // Before, it should have no mappings
      results = await server.db.collection("mappings").find(query).toArray()
      assert.strictEqual(results.length, 0)
      // Add mappings to database
      await exec(`NODE_ENV=test ./bin/import.js mappings ./test/mappings/mapping-ddc-gnd-noScheme.json -c ${concordance}`)
      results = await server.db.collection("mappings").find(query).toArray()
      assert.strictEqual(results.length, 3)
      results.forEach(mapping => {
        assert.ok(mapping.fromScheme?.uri, "fromScheme field is missing from mapping")
        assert.ok(mapping.toScheme?.uri, "toScheme field is missing from mapping")
      })
    })

    it("should import annotations", async () => {
      // Import one annotation
      let results
      results = await server.db.collection("annotations").find({}).toArray()
      assert.strictEqual(results.length, 0)
      await exec("NODE_ENV=test ./bin/import.js annotations ./test/annotations/annotation.json")
      results = await server.db.collection("annotations").find({}).toArray()
      assert.strictEqual(results.length, 1)
    })

    it("should fail on --reset (was removed)", async () => {
      try {
        await exec("NODE_ENV=test ./bin/import.js --reset")
        assert.fail("Expected import script with option --reset to fail.")
      } catch (error) {
        // Ignore error
      }
    })

    it("should fail without parameters", async () => {
      try {
        await exec("NODE_ENV=test ./bin/import.js")
        assert.fail("Expected import script to fail without parameters.")
      } catch (error) {
        // Ignore error
      }
    })

    it("should fail on with invalid type option", async () => {
      try {
        await exec("NODE_ENV=test ./bin/import.js asbfamshbfa")
        assert.fail("Expected import script with invalid type option to fail.")
      } catch (error) {
        // Ignore error
      }
    })

    it("should fail when no file is given", async () => {
      try {
        await exec("NODE_ENV=test ./bin/import.js concepts")
        assert.fail("Expected import script with no file to fail.")
      } catch (error) {
        // Ignore error
      }
    })

    it("should fail when -c is used with type other than mapping", async () => {
      try {
        await exec("NODE_ENV=test ./bin/import.js -c some:uri concepts ./some/file/doesntmatter")
        assert.fail("Expected import script with option -c to fail when type is not mapping.")
      } catch (error) {
        // Ignore error
      }
    })

  })

  describe("Reset Script", () => {

    it("should abort reset script when given no as input", async () => {
      try {
        await exec("echo no | NODE_ENV=test ./bin/reset.js")
        assert.fail("Expected reset script to abort.")
      } catch (error) {
        assert(error.stdout.includes("Is that okay?"))
        assert(error.stderr.includes("Error: Aborting"))
      }
    })

    const type = "annotations"
    it(`should delete ${type}`, async () => {
      await exec(`yes | NODE_ENV=test ./bin/reset.js -t ${type}`)
      for (let collection of ["concepts", "mappings", "terminologies", "annotations", "concordances"]) {
        const result = await server.db.collection(collection).find({}).toArray()
        if (collection == type) {
          assert.strictEqual(result.length, 0)
        } else {
          assert.notStrictEqual(result.length, 0)
        }
      }
    })

    it("should delete concepts from certain scheme", async () => {
      const scheme = "http://dewey.info/scheme/edition/e23/"
      try {
        await exec(`echo no | NODE_ENV=test ./bin/reset.js -s ${scheme}`)
        assert.fail("Expected exec to fail.")
      } catch (error) {
        assert(error.stdout.includes(`from scheme ${scheme}`))
        assert(error.stdout.includes("concepts will be deleted"))
      }
    })

    it("should delete mappings from certain concordance", async () => {
      const concordance = "http://coli-conc.gbv.de/concordances/ddc_rvk_medizin"
      try {
        await exec(`echo no | NODE_ENV=test ./bin/reset.js -c ${concordance}`)
        assert.fail("Expected exec to fail.")
      } catch (error) {
        assert(error.stdout.includes(`from concordance ${concordance}`))
        assert(error.stdout.includes("mappings will be deleted"))
      }
    })

    it("should delete entities with specific URIs", async () => {
      let results
      results = await server.db.collection("concepts").find({}).toArray()
      const lengthBefore = results.length
      const uris = results.map(r => r.uri).slice(0, 2)
      await exec(`yes | NODE_ENV=test ./bin/reset.js ${uris.join(" ")}`)
      results = await server.db.collection("concepts").find({}).toArray()
      assert.strictEqual(results.length, lengthBefore - uris.length)
    })

    const abortMessageForNoEntities = "Did not find any entities to be deleted, aborting"

    it("should fail when -s and -c are given", async () => {
      try {
        await exec("yes | NODE_ENV=test ./bin/reset.js -s a:b -c c:d")
        assert.fail("Expected exec to fail.")
      } catch (error) {
        assert(!error.stderr.includes(abortMessageForNoEntities))
      }
    })

    it("should fail when -s is used with type other than concepts", async () => {
      try {
        await exec("yes | NODE_ENV=test ./bin/reset.js -s a:b -t mappings")
        assert.fail("Expected exec to fail.")
      } catch (error) {
        assert(!error.stderr.includes(abortMessageForNoEntities))
      }
    })

    it("should fail when -c is used with type other than mappings", async () => {
      try {
        await exec("yes | NODE_ENV=test ./bin/reset.js -c c:d -t concepts")
        assert.fail("Expected exec to fail.")
      } catch (error) {
        assert(!error.stderr.includes(abortMessageForNoEntities))
      }
    })

    it("should fail when -s is used with URI", async () => {
      try {
        await exec("yes | NODE_ENV=test ./bin/reset.js -s a:b c:d")
        assert.fail("Expected exec to fail.")
      } catch (error) {
        assert(!error.stderr.includes(abortMessageForNoEntities))
      }
    })

    it("should clear the whole database", async () => {
      // Clear database
      await exec("yes | NODE_ENV=test ./bin/reset.js")
      for (let collection of ["concepts", "mappings", "terminologies"]) {
        const result = await server.db.collection(collection).find({}).toArray()
        assert.strictEqual(result.length, 0)
      }
    })

    it("should fail if trying to clear the database a second time", async () => {
      try {
        await exec("yes | NODE_ENV=test ./bin/reset.js")
        assert.fail("Expected reset script to fail if there are no entities to delete.")
      } catch (error) {
        assert(error.stderr.includes(abortMessageForNoEntities))
      }
    })

  })

})
