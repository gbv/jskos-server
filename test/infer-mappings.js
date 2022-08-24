/* eslint-env node, mocha */

const chai = require("chai")
const chaiAsPromised = require("chai-as-promised")
chai.use(chaiAsPromised)
const chaiHttp = require("chai-http")
chai.use(chaiHttp)
// eslint-disable-next-line no-unused-vars
const should = chai.should()
const server = require("../server")
const assert = require("assert")
const { assertIndexes, assertMongoDB, dropDatabaseBeforeAndAfter } = require("./test-utils")

const _ = require("lodash")
const config = require("../config")

assertMongoDB()
dropDatabaseBeforeAndAfter()

describe("Indexes", () => {
  assertIndexes()
})

// Prepare jwt
const jwt = require("jsonwebtoken")
const user = {
  uri: "http://test.user",
  name: "Test User",
  identities: {
    test: {},
  },
}
const token = jwt.sign({ user }, "test")

const scheme = {
  uri: "test:source-scheme",
}
const inScheme = [scheme]

const targetScheme = {
  uri: "test:target-scheme",
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

  [scheme, targetScheme].forEach(s => {
    it("should POST test scheme", done => {
      scheme.API = [
        {
          type: "http://bartoc.org/api-type/jskos",
          url: `http://localhost:${config.port}`,
        },
      ],
      chai.request(server.app)
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
    chai.request(server.app)
      .post("/data")
      .send(concepts)
      .end((error, res) => {
        res.should.have.status(201)
        res.body.should.be.an("array")
        assert.equal(res.body.length, concepts.length)
        done()
      })
  })

  it("should return empty result for /mappings/infer", done => {
    chai.request(server.app)
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
    chai.request(server.app)
      .post("/mappings")
      .set("Authorization", `Bearer ${token}`)
      .send(mapping)
      .end((err, res) => {
        assert.equal(res.status, 201)
        const mappingUri = res.body.uri
        // Request /mappings/infer again
        chai.request(server.app)
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
            done()
          })
      })
  })

})
