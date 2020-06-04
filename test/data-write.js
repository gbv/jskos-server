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

  it("should not POST an invalid scheme", done => {
    done()
    // TODO
  })

  it("should not POST a scheme that already exists", done => {
    done()
    // TODO
  })

  it("should PUT a scheme", done => {
    done()
    // TODO
  })

  it("should not PUT an invalid scheme", done => {
    done()
    // TODO
  })

  it("should not PUT a scheme that doesn't exist", done => {
    done()
    // TODO
  })

  it("should DELETE a scheme", done => {
    done()
    // TODO
  })

  it("should not DELETE a scheme that doesn't exist", done => {
    done()
    // TODO
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
      inScheme: [schemes[1]],
    },
    {
      uri: "test:concept3",
      inScheme: [schemes[2]],
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

  it("should not POST a concept without scheme", done => {
    done()
    // TODO
  })

  it("should not POST an invalid concept", done => {
    done()
  })

  it("should not POST a concept that already exists", done => {
    done()
  })

  it("should not POST a concept with scheme that is not in database", done => {
    done()
    // TODO
  })

  it("should PUT a concept", done => {
    done()
    // TODO
  })

  it("should not PUT an invalid concept", done => {
    done()
  })

  it("should not PUT a concept that doesn't exist", done => {
    done()
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

  it("should not DELETE a concept that doesn't exist", done => {
    done()
    // TODO
  })

})
