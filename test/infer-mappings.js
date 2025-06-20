/* eslint-env node, mocha */

import chai from "./chai.js"

import * as server from "../server.js"
import assert from "node:assert"
import { assertIndexes, assertMongoDB, dropDatabaseBeforeAndAfter, setupInMemoryMongo, createCollectionsAndIndexes, teardownInMemoryMongo } from "./test-utils.js"

import _ from "lodash"
import config from "../config/index.js"

// Prepare jwt
import jwt from "jsonwebtoken"
const user = {
  uri: "http://test.user",
  name: "Test User",
  identities: {
    test: {},
  },
}
const token = jwt.sign({ user }, "test")

const scheme = {
  uri: "urn:test:source-scheme",
}
scheme.namespace = `${scheme.uri}:`

const inScheme = [scheme]

const targetScheme = {
  uri: "urn:test:target-scheme",
}

const concepts = [
  {
    inScheme,
    topConceptOf: [scheme],
    uri: `${scheme.uri}:1`,
  },
  {
    inScheme,
    uri: `${scheme.uri}:1.1`,
    broader: [{ uri: `${scheme.uri}:1` }],
  },
  {
    inScheme,
    uri: `${scheme.uri}:1.1.1`,
    broader: [{ uri: `${scheme.uri}:1.1` }],
  },
]

describe("/mappings/infer", () => {
  before(async () => {
    const mongoUri = await setupInMemoryMongo({ replSet: false })
    process.env.MONGO_URI = mongoUri  
    await createCollectionsAndIndexes()
    await assertIndexes()
  })
        
  after(async () => {
    // close server if you started one
    await teardownInMemoryMongo()
  })
        
  // 🗑 Drop DB before *and* after every single `it()` in this file
  dropDatabaseBeforeAndAfter()
        
  // 🔌 Sanity‐check that mongoose really is connected
  assertMongoDB()

  const schemeTargetScheme = [scheme, targetScheme]
  schemeTargetScheme.forEach(s => {
    it("should POST test scheme", done => {
      scheme.API = [
        {
          type: "http://bartoc.org/api-type/jskos",
          url: `http://localhost:${config.port}`,
        },
      ],
      chai.request.execute(server.app)
        .post("/voc")
        .send(s)
        .end((error, res) => {
          assert.equal(error, null)
          res.should.have.status(201)
          res.body.should.be.an("object")
          assert.equal(res.body.uri, s.uri)
          // Should have no concepts or top concepts
          assert.deepEqual(res.body.concepts, [])
          assert.deepEqual(res.body.topConcepts, [])
          done()
        })
    })
  })

  it("should POST test concepts", done => {
    chai.request.execute(server.app)
      .post("/concepts")
      .send(concepts)
      .end((error, res) => {
        res.should.have.status(201)
        res.body.should.be.an("array")
        assert.equal(res.body.length, concepts.length)
        done()
      })
  })

  it("should return empty result for /mappings/infer", done => {
    chai.request.execute(server.app)
      .get("/mappings/infer")
      .query({
        from: _.last(concepts).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 0)
        done()
      })
  })

  it("should add a mapping for an ancestor concept and return it as inferred mapping", done => {
    const mapping = {
      from: { memberSet: [concepts[0]] },
      fromScheme: scheme,
      to: { memberSet: [{ uri: `${targetScheme.uri}:5` }] },
      toScheme: targetScheme,
    }
    chai.request.execute(server.app)
      .post("/mappings")
      .set("Authorization", `Bearer ${token}`)
      .send(mapping)
      .end((err, res) => {
        assert.equal(res.status, 201)
        const mappingUri = res.body.uri
        // Request /mappings/infer again
        chai.request.execute(server.app)
          .get("/mappings/infer")
          .query({
            from: _.last(concepts).uri,
            fromScheme: scheme.uri,
            toScheme: targetScheme.uri,
          })
          .end((error, res) => {
            res.should.have.status(200)
            res.body.should.be.an("array")
            assert.equal(res.body.length, 1)
            assert.equal(res.body[0].source[0].uri, mappingUri)
            // Since the mapping has no type, expect mappingRelation
            assert.equal(res.body[0].type[0], "http://www.w3.org/2004/02/skos/core#mappingRelation")
            done()
          })
      })
  })

  it("should also work with notation instead of URI", done => {
    chai.request.execute(server.app)
      .get("/mappings/infer")
      .query({
        from: _.last(concepts).uri.replace(scheme.namespace, ""),
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 1)
        done()
      })
  })

  it("should return nothing for previous request if depth is set to 1", done => {
    chai.request.execute(server.app)
      .get("/mappings/infer")
      .query({
        from: _.last(concepts).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        depth: 1,
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 0)
        done()
      })
  })

  it("should add a mapping for a deeper ancestor concept and return it instead as inferred mapping; also adjust mapping type", done => {
    const mapping = {
      from: { memberSet: [concepts[1]] },
      fromScheme: scheme,
      to: { memberSet: [{ uri: `${targetScheme.uri}:6` }] },
      toScheme: targetScheme,
      type: ["http://www.w3.org/2004/02/skos/core#closeMatch"],
    }
    chai.request.execute(server.app)
      .post("/mappings")
      .set("Authorization", `Bearer ${token}`)
      .send(mapping)
      .end((err, res) => {
        assert.equal(res.status, 201)
        const mappingUri = res.body.uri
        // Request /mappings/infer again
        chai.request.execute(server.app)
          .get("/mappings/infer")
          .query({
            from: _.last(concepts).uri,
            fromScheme: scheme.uri,
            toScheme: targetScheme.uri,
          })
          .end((error, res) => {
            res.should.have.status(200)
            res.body.should.be.an("array")
            assert.equal(res.body.length, 1)
            assert.equal(res.body[0].source[0].uri, mappingUri)
            // Since the mapping has type closeMatch and `strict` is false by default, expect narrowMatch
            assert.equal(res.body[0].type[0], "http://www.w3.org/2004/02/skos/core#narrowMatch")
            done()
          })
      })
  })

  it("should return nothing for previous request if depth is set to 0", done => {
    chai.request.execute(server.app)
      .get("/mappings/infer")
      .query({
        from: _.last(concepts).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        depth: 0,
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 0)
        done()
      })
  })

  it("should not use mapping of type `closeMatch` for inference if parameter `strict` is set", done => {
    chai.request.execute(server.app)
      .get("/mappings/infer")
      .query({
        from: _.last(concepts).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        strict: "true",
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 1)
        assert.notEqual(res.body[0].to.memberSet[0].uri, `${targetScheme.uri}:6`)
        assert.equal(res.body[0].to.memberSet[0].uri, `${targetScheme.uri}:5`)
        done()
      })
  })

  it("should add a mapping for the requested concept and return it instead", done => {
    const mapping = {
      from: { memberSet: [_.last(concepts)] },
      fromScheme: scheme,
      to: { memberSet: [{ uri: `${targetScheme.uri}:7` }] },
      toScheme: targetScheme,
    }
    chai.request.execute(server.app)
      .post("/mappings")
      .set("Authorization", `Bearer ${token}`)
      .send(mapping)
      .end((err, res) => {
        assert.equal(res.status, 201)
        const mappingUri = res.body.uri
        // Request /mappings/infer again
        chai.request.execute(server.app)
          .get("/mappings/infer")
          .query({
            from: _.last(concepts).uri,
            fromScheme: scheme.uri,
            toScheme: targetScheme.uri,
            depth: 0,
          })
          .end((error, res) => {
            res.should.have.status(200)
            res.body.should.be.an("array")
            assert.equal(res.body.length, 1)
            assert.equal(res.body[0].uri, mappingUri)
            done()
          })
      })
  })

  it("should return empty result when mappings of type `broadMatch` are requested", done => {
    chai.request.execute(server.app)
      .get("/mappings/infer")
      .query({
        from: _.last(concepts).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        type: "http://www.w3.org/2004/02/skos/core#broadMatch",
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 0)
        done()
      })
  })

  it("should throw error when parameter `to` is given", done => {
    chai.request.execute(server.app)
      .get("/mappings/infer")
      .query({
        from: _.last(concepts).uri,
        fromScheme: scheme.uri,
        to: "test",
        toScheme: targetScheme.uri,
      })
      .end((error, res) => {
        res.should.have.status(400)
        done()
      })
  })

  it("should throw error when parameter `direction` is given with value `backward`", done => {
    chai.request.execute(server.app)
      .get("/mappings/infer")
      .query({
        from: _.last(concepts).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        direction: "backward",
      })
      .end((error, res) => {
        res.should.have.status(400)
        done()
      })
  })

})
