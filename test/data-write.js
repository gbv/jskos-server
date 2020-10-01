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
const { dropDatabaseBeforeAndAfter } = require("./test-utils")

const schemes = [
  {
    uri: "test:scheme1",
  },
  {
    uri: "test:scheme2",
  },
  {
    uri: "test:scheme3",
  },
]

dropDatabaseBeforeAndAfter()

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

describe("/voc write access", () => {

  it("should POST a single scheme", done => {
    chai.request(server.app)
      .post("/voc")
      .send(schemes[0])
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(201)
        res.body.should.be.an("object")
        assert.equal(res.body.uri, schemes[0].uri)
        // Should have no concepts or top concepts
        assert.deepEqual(res.body.concepts, [])
        assert.deepEqual(res.body.topConcepts, [])
        done()
      })
  })

  it("should POST multiple schemes", done => {
    chai.request(server.app)
      .post("/voc")
      .send(schemes.slice(1))
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(201)
        res.body.should.be.an("array")
        assert.deepEqual(res.body.map(c => c.uri), schemes.slice(1).map(c => c.uri))
        for (let scheme of res.body) {
          // Should have no concepts or top concepts
          assert.deepEqual(scheme.concepts, [])
          assert.deepEqual(scheme.topConcepts, [])
        }
        done()
      })
  })

  it("should not POST an invalid scheme (1 - invalid prefLabel)", done => {
    chai.request(server.app)
      .post("/voc")
      .send({
        uri: "uri:test",
        prefLabel: "test",
      })
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(422)
        res.body.should.be.an("object")
        assert.equal(res.body.error, "InvalidBodyError")
        done()
      })
  })

  it("should not POST an invalid scheme (2 - missing URI)", done => {
    chai.request(server.app)
      .post("/voc")
      .send({
        prefLabel: { en: "test" },
      })
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(422)
        res.body.should.be.an("object")
        assert.equal(res.body.error, "InvalidBodyError")
        done()
      })
  })

  it("should not POST a scheme that already exists", done => {
    chai.request(server.app)
      .post("/voc")
      .send(schemes[0])
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(422)
        res.body.should.be.an("object")
        assert.equal(res.body.error, "DuplicateEntityError")
        done()
      })
  })

  it("should bulk POST schemes and ignore errors", done => {
    const bulkSchemes = [
      {
        uri: "test:scheme-bulk1",
      },
      {
        uri: "test:scheme-bulk2",
      },
      {
        uri: "test-scheme-bulk-invalid",
      },
      {
        uri: schemes[0].uri,
        prefLabel: { en: "Bulk updated scheme" },
      },
    ]
    chai.request(server.app)
      .post("/voc")
      .query({
        bulk: true,
      })
      .send(bulkSchemes)
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(201)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 3) // one invalid scheme removed
        // Check updated scheme
        chai.request(server.app).get("/voc").query({ uri: schemes[0].uri }).end((error, res) => {
          assert.equal(error, null)
          res.should.have.status(200)
          res.body.should.be.an("array")
          assert.equal(res.body.length, 1)
          assert.equal(res.body[0].uri, schemes[0].uri)
          assert.deepEqual(res.body[0].prefLabel, bulkSchemes.find(s => s.uri == schemes[0].uri).prefLabel)
          res.body[0].concepts.should.be.an("array")
          res.body[0].topConcepts.should.be.an("array")
          done()
        })
      })
  })

  it("should PUT a scheme", done => {
    const patch = {
      notation: ["A"],
    }
    chai.request(server.app)
      .put("/voc")
      .send(Object.assign({}, schemes[0], patch))
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(200)
        res.body.should.be.an("object")
        assert.deepEqual(res.body.notation, patch.notation)
        done()
      })
  })

  it("should not PUT an invalid scheme", done => {
    const patch = {
      notation: "A",
    }
    chai.request(server.app)
      .put("/voc")
      .send(Object.assign({}, schemes[0], patch))
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(422)
        res.body.should.be.an("object")
        assert.equal(res.body.error, "InvalidBodyError")
        done()
      })
  })

  it("should not PUT a scheme that doesn't exist", done => {
    chai.request(server.app)
      .put("/voc")
      .send({
        uri: "test:scheme-that-does-not-exist",
        notation: ["A"],
      })
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(404)
        res.body.should.be.an("object")
        assert.equal(res.body.error, "EntityNotFoundError")
        done()
      })
  })

  it("should DELETE a scheme", done => {
    chai.request(server.app)
      .delete("/voc")
      .query({
        uri: schemes[2].uri,
      })
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(204)
        done()
      })
  })

  it("should not DELETE a scheme that doesn't exist", done => {
    chai.request(server.app)
      .delete("/voc")
      .query({
        uri: "test:scheme-that-does-not-exist",
      })
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(404)
        res.body.should.be.an("object")
        assert.equal(res.body.error, "EntityNotFoundError")
        done()
      })
  })

})

describe("/data write access", () => {

  const concept = {
    uri: "test:concept",
    inScheme: [schemes[0]],
  }

  const concepts = [
    {
      uri: "test:concept2",
      topConceptOf: [schemes[1]],
    },
    {
      uri: "test:concept3",
      inScheme: [schemes[0]],
      broader: [concept],
    },
  ]

  it("should POST a concept", done => {
    chai.request(server.app)
      .post("/data")
      .send(concept)
      .end((error, res) => {
        res.should.have.status(201)
        res.body.should.be.a("object")
        assert.equal(res.body.uri, concept.uri)
        done()
      })
  })

  it("should have refreshed the `concepts` property of the scheme after POSTing a concept", done => {
    chai.request(server.app)
      .get("/voc")
      .query({
        uri: concept.inScheme[0].uri,
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.a("array")
        res.body[0].should.be.a("object")
        assert.equal(res.body[0].uri, concept.inScheme[0].uri)
        assert.deepEqual(res.body[0].concepts, [null])
        done()
      })
  })

  it("should not DELETE a scheme when it currently has concepts", done => {
    chai.request(server.app)
      .delete("/voc")
      .query({
        uri: concept.inScheme[0].uri,
      })
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(400)
        res.body.should.be.a("object")
        assert.equal(res.body.error, "MalformedRequestError")
        done()
      })
  })

  it("should POST multiple concepts", done => {
    chai.request(server.app)
      .post("/data")
      .send(concepts)
      .end((error, res) => {
        res.should.have.status(201)
        res.body.should.be.an("array")
        assert.deepEqual(res.body.map(c => c.uri), concepts.map(c => c.uri))
        done()
      })
  })

  it("should have refreshed the `topConcepts` property of the scheme after POSTing a top concept", done => {
    chai.request(server.app)
      .get("/voc")
      .query({
        uri: concepts[0].topConceptOf[0].uri,
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.a("array")
        res.body[0].should.be.a("object")
        assert.equal(res.body[0].uri, concepts[0].topConceptOf[0].uri)
        assert.deepEqual(res.body[0].topConcepts, [null])
        done()
      })
  })

  it("should not POST a concept without scheme", done => {
    chai.request(server.app)
      .post("/data")
      .send({
        uri: "test:concept-without-scheme",
      })
      .end((error, res) => {
        res.should.have.status(400)
        res.body.should.be.a("object")
        assert.equal(res.body.error, "MalformedRequestError")
        done()
      })
  })

  it("should not POST a concept with invalid URI", done => {
    chai.request(server.app)
      .post("/data")
      .send({
        uri: "concept-invalid-uri",
        inScheme: [schemes[1]],
      })
      .end((error, res) => {
        res.should.have.status(422)
        res.body.should.be.a("object")
        assert.equal(res.body.error, "InvalidBodyError")
        done()
      })
  })

  it("should not POST a concept with missing URI", done => {
    chai.request(server.app)
      .post("/data")
      .send({
        inScheme: [schemes[1]],
      })
      .end((error, res) => {
        res.should.have.status(422)
        res.body.should.be.a("object")
        assert.equal(res.body.error, "InvalidBodyError")
        done()
      })
  })

  it("should not POST a concept that already exists", done => {
    chai.request(server.app)
      .post("/data")
      .send(concept)
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(422)
        res.body.should.be.an("object")
        assert.equal(res.body.error, "DuplicateEntityError")
        done()
      })
  })

  it("should not POST a single concept that already exists even if bulk is set", done => {
    chai.request(server.app)
      .post("/data")
      .query({
        bulk: true,
      })
      .send(concept)
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(422)
        res.body.should.be.an("object")
        assert.equal(res.body.error, "DuplicateEntityError")
        done()
      })
  })

  it("should POST upsert multiple concepts", done => {
    chai.request(server.app)
      .post("/data")
      .query({
        bulk: true,
      })
      .send(concepts)
      .end((error, res) => {
        res.should.have.status(201)
        res.body.should.be.an("array")
        assert.deepEqual(res.body.map(c => c.uri), concepts.map(c => c.uri))
        assert.deepEqual(Object.keys(res.body[0]), ["uri"])
        done()
      })
  })

  it("should ignore POST errors when bulk is set", done => {
    chai.request(server.app)
      .post("/data")
      .query({
        bulk: true,
      })
      .send([{
        uri: "concept-invalid-uri",
        inScheme: [schemes[1]],
      }])
      .end((error, res) => {
        res.should.have.status(201)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 0)
        done()
      })
  })

  it("should not POST a concept with scheme that is not in database", done => {
    chai.request(server.app)
      .post("/data")
      .send({
        uri: "test:concept-with-missing-scheme",
        inScheme: [
          {
            uri: "test:scheme-that-does-not-exist",
          },
        ],
      })
      .end((error, res) => {
        res.should.have.status(400)
        res.body.should.be.a("object")
        assert.equal(res.body.error, "MalformedRequestError")
        done()
      })
  })

  it("should PUT a concept", done => {
    const patch = {
      notation: ["A"],
    }
    chai.request(server.app)
      .put("/data")
      .send(Object.assign({}, concept, patch))
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(200)
        res.body.should.be.an("object")
        assert.deepEqual(res.body.notation, patch.notation)
        done()
      })
  })

  it("should not PUT an invalid concept", done => {
    chai.request(server.app)
      .put("/data")
      .send({
        uri: "test:concept2",
        inScheme: [schemes[1]],
        prefLabel: "should be an object",
      })
      .end((error, res) => {
        res.should.have.status(422)
        res.body.should.be.a("object")
        assert.equal(res.body.error, "InvalidBodyError")
        done()
      })
  })

  it("should not PUT a concept that doesn't exist", done => {
    chai.request(server.app)
      .put("/data")
      .send({
        uri: "test:concept-that-does-not-exist",
        inScheme: [schemes[1]],
        prefLabel: { en: "should be an object" },
      })
      .end((error, res) => {
        res.should.have.status(404)
        res.body.should.be.a("object")
        assert.equal(res.body.error, "EntityNotFoundError")
        done()
      })
  })

  it("should DELETE posted concepts", done => {
    concepts.push(concept)
    let count = 0
    const maybeDone = () => {
      count += 1
      if (count == concepts.length) {
        done()
      }
    }
    for (let concept of concepts) {
      chai.request(server.app)
        .delete("/data")
        .query({
          uri: concept.uri,
        })
        .end((err, res) => {
          res.should.have.status(204)
          maybeDone()
        })
    }
  })

  it("should have refreshed the `concepts` property of the scheme after DELETEing a concept", done => {
    chai.request(server.app)
      .get("/voc")
      .query({
        uri: concept.inScheme[0].uri,
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.a("array")
        res.body[0].should.be.a("object")
        assert.equal(res.body[0].uri, concept.inScheme[0].uri)
        assert.deepEqual(res.body[0].concepts, [])
        done()
      })
  })

  it("should DELETE a scheme after its last concept was removed", done => {
    chai.request(server.app)
      .delete("/voc")
      .query({
        uri: concept.inScheme[0].uri,
      })
      .end((error, res) => {
        assert.equal(error, null)
        res.should.have.status(204)
        done()
      })
  })

  it("should have refreshed the `topConcepts` property of the scheme after DELETEing a top concept", done => {
    chai.request(server.app)
      .get("/voc")
      .query({
        uri: concepts[0].topConceptOf[0].uri,
      })
      .end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.a("array")
        res.body[0].should.be.a("object")
        assert.equal(res.body[0].uri, concepts[0].topConceptOf[0].uri)
        assert.deepEqual(res.body[0].topConcepts, [])
        done()
      })
  })

  it("should not DELETE a concept that doesn't exist", done => {
    chai.request(server.app)
      .delete("/data")
      .query({
        uri: "test:concept-that-does-not-exist",
      })
      .end((error, res) => {
        res.should.have.status(404)
        res.body.should.be.a("object")
        assert.equal(res.body.error, "EntityNotFoundError")
        done()
      })
  })

})
