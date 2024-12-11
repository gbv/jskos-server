// Tests for /validate endpoints

import chai from "./chai.js"

import * as server from "../server.js"

import { globSync } from "glob"
import fs from "node:fs"

import assert from "node:assert"

import { dropDatabaseBeforeAndAfter } from "./test-utils.js"

let types = ["resource", "item", "concept", "scheme", "mapping", "concordance", "registry", "distributions", "occurrence", "bundle", "annotation"]
let examples = {}

// Import local examples
for (let type of types) {
  examples[type] = []
  for (let expected of [true, false]) {
    let files = globSync(`./node_modules/jskos-validate/examples/${type}/${expected ? "pass" : "fail"}/*.json`)
    for (let file of files) {
      try {
        let object = JSON.parse(fs.readFileSync(file))
        examples[type].push({
          object,
          expected,
          file,
        })
      } catch(error) {
        console.log("Unable to parse file", file)
      }
    }
  }
}

describe("Validation endpoint: jskos-validate tests", () => {

  // Validate difference object types
  for (let type of types) {
    let typePlural = type + "s"
    describe(typePlural, () => {
      for (let { object, expected, file } of examples[type]) {
        it(`should validate ${typePlural} (${file})`, done => {
          // Support for arrays of objects
          let objects = [object]
          if (Array.isArray(object)) {
            objects = object
          }
          for (let object of objects) {
            chai.request.execute(server.app)
              .post("/validate")
              .query({
                type,
              })
              .send(object)
              .end((error, res) => {
                assert.equal(error, null)
                res.should.have.status(201)
                res.body.should.be.an("array")
                if (expected) {
                  assert.strictEqual(res.body[0], true)
                } else {
                  res.body[0].should.be.an("array")
                  assert.notEqual(res.body[0].length, 0)
                }
                done()
              })
          }
        })
      }
    })
  }
})

describe("Validation endpoint: parameters", () => {

  dropDatabaseBeforeAndAfter()

  it("should validate empty object without type parameter", done => {
    chai.request.execute(server.app)
      .post("/validate")
      .send({})
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(201)
        res.body.should.be.an("array")
        assert.equal(res.body[0], true)
        done()
      })
  })

  it("should fail validation for object with unknown parameter, but pass when `unknownFields` is set", done => {
    const object = { abcdef: 1 }
    chai.request.execute(server.app)
      .post("/validate")
      .send(object)
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(201)
        res.body.should.be.an("array")
        res.body[0].should.be.an("array")
        assert.notEqual(res.body[0].length, 0)

        // Set parameter
        chai.request.execute(server.app)
          .post("/validate")
          .query({
            unknownFields: true,
          })
          .send(object)
          .end((error, res) => {
            assert.equal(error, null)
            res.should.have.status(201)
            res.body.should.be.an("array")
            assert.equal(res.body[0], true)
            done()
          })
      })
  })

  it("should remember validated schemes if no type is set", done => {
    const objects = [
      {
        type: ["http://www.w3.org/2004/02/skos/core#ConceptScheme"],
        uri: "http://example.org/voc",
        notationPattern: "[a-z]+",
      },
      {
        type: ["http://www.w3.org/2004/02/skos/core#Concept"],
        uri: "http://example.org/1",
        notation: ["abc"],
        inScheme: [{uri: "http://example.org/voc"}],
      },
      {
        type: ["http://www.w3.org/2004/02/skos/core#Concept"],
        uri: "http://example.org/2",
        notation: ["123"],
        inScheme: [{uri: "http://example.org/voc"}],
      },
    ]
    chai.request.execute(server.app)
      .post("/validate")
      .send(objects)
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(201)
        res.body.should.be.an("array")
        assert.equal(res.body.length, objects.length)
        assert.equal(res.body[0], true)
        assert.equal(res.body[1], true)
        // Last concept should fail because notation does not match scheme's notationPattern
        res.body[2].should.be.an("array")
        assert.equal(res.body[2].length, 1)
        done()
      })
  })

  it("should POST a scheme, then use that scheme's notationPattern to validate objects when `knownSchemes` is set", done => {
    const scheme = {
      type: ["http://www.w3.org/2004/02/skos/core#ConceptScheme"],
      uri: "http://example.org/voc",
      notationPattern: "[a-z]+",
    }
    const objects = [
      {
        uri: "http://example.org/1",
        notation: ["abc"],
        inScheme: [{ uri: scheme.uri }],
      },
      {
        uri: "http://example.org/2",
        notation: ["123"],
        inScheme: [{ uri: scheme.uri }],
      },
    ]
    // 1. POST scheme
    chai.request.execute(server.app)
      .post("/voc")
      .send(scheme)
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(201)
        res.body.should.be.an("object")
        assert.equal(res.body.uri, scheme.uri)
        // 2. Validate objects
        chai.request.execute(server.app)
          .post("/validate")
          .query({
            knownSchemes: true,
            // type: concept is implied
          })
          .send(objects)
          .end((error, res) => {
            assert.equal(error, null)
            res.should.have.status(201)
            res.body.should.be.an("array")
            // First concept should pass
            assert.equal(res.body[0], true)
            // Second concept should fail
            res.body[1].should.be.an("array")
            assert.notEqual(res.body[1].length, 0)
            done()
          })
      })
  })

})
