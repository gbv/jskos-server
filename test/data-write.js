/* eslint-env node, mocha */

import chai from "./chai.js"

import * as server from "../server.js"
import assert from "node:assert"
import { assertMongoDB, setupInMemoryMongo, createCollectionsAndIndexes, teardownInMemoryMongo } from "./test-utils.js"

const schemes = [
  {
    uri: "urn:test:scheme1",
    notation: ["scheme1"],
  },
  {
    uri: "urn:test:scheme2",
    prefLabel: {
      fr: "somelabel",
    },
    altLabel: {
      de: [
        "an altLabel",
      ],
    },
    notation: ["scheme2"],
  },
  {
    uri: "urn:test:scheme3",
    definition: {
      en: [
        "this contains somelabel but shouldn't be found when leaving off the some",
      ],
    },
    notation: ["scheme3"],
  },
]

describe("Data Writing features", () => {
  before(async () => {
    const mongoUri = await setupInMemoryMongo({ replSet: false })
    process.env.MONGO_URI = mongoUri  
    await createCollectionsAndIndexes()
  })
      
  after(async () => {
    // close server if you started one
    await teardownInMemoryMongo()
  })
          
  // 🔌 Sanity‐check that mongoose really is connected
  assertMongoDB()


  describe("/voc write access", () => {

    it("should POST a single scheme", done => {
      chai.request.execute(server.app)
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
          // Should have created and modified properties
          assert.ok(!!res.body.created)
          assert.ok(!!res.body.modified)
          done()
        })
    })

    it("should POST multiple schemes", done => {
      chai.request.execute(server.app)
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

    // TODO: Maybe move somewhere else?
    it("should GET correct results for notation", done => {
      chai.request.execute(server.app)
        .get("/voc/suggest")
        .query({
          search: "sche",
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(4) // OpenSearch Suggest Format
          res.body[0].should.be.a("string")
          res.body[1].should.be.a("array")
          res.body[1].length.should.be.eql(schemes.length)
          res.body[1][0].should.be.eql("scheme1")
          res.body[3].should.be.a("array")
          res.body[3].length.should.be.eql(schemes.length)
          res.body[3][0].should.be.eql("urn:test:scheme1")
          done()
        })
    })

    // TODO: Maybe move somewhere else?
    it("should GET correct results for term (1)", done => {
      chai.request.execute(server.app)
        .get("/voc/suggest")
        .query({
          search: "label",
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(4) // OpenSearch Suggest Format
          res.body[0].should.be.a("string")
          res.body[1].should.be.a("array")
          res.body[1].length.should.be.eql(1)
          res.body[3].should.be.a("array")
          res.body[3].length.should.be.eql(1)
          res.body[3][0].should.be.eql("urn:test:scheme2")
          done()
        })
    })

    // TODO: Maybe move somewhere else?
    it("should GET correct results for term (2)", done => {
      chai.request.execute(server.app)
        .get("/voc/suggest")
        .query({
          search: "somelabel",
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(4) // OpenSearch Suggest Format
          res.body[0].should.be.a("string")
          res.body[1].should.be.a("array")
          res.body[1].length.should.be.eql(2)
          res.body[3].should.be.a("array")
          res.body[3].length.should.be.eql(2)
          res.body[3][0].should.be.eql("urn:test:scheme2")
          res.body[3][1].should.be.eql("urn:test:scheme3")
          done()
        })
    })

    it("should not POST an invalid scheme (1 - invalid prefLabel)", done => {
      chai.request.execute(server.app)
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
      chai.request.execute(server.app)
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
      chai.request.execute(server.app)
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
          uri: "urn:test:scheme-bulk1",
        },
        {
          uri: "urn:test:scheme-bulk2",
        },
        {
          uri: "test-scheme-bulk-invalid",
        },
        {
          uri: schemes[0].uri,
          prefLabel: { en: "Bulk updated scheme" },
        },
      ]
      chai.request.execute(server.app)
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
          chai.request.execute(server.app).get("/voc").query({ uri: schemes[0].uri }).end((error, res) => {
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

    it("should PUT a scheme (created should be removed, modified should be updated)", async () => {
      const patch = {
        notation: ["A"],
        created: "2012",
      }
      let scheme = schemes[0], res
      // 1. Get current scheme from database
      res = await chai.request.execute(server.app)
        .get("/voc")
        .query({
          uri: scheme.uri,
        })
      assert.strictEqual(res.status, 200)
      scheme = res.body[0]
      assert.ok(!!scheme)
      // 2. Make PUT request
      res = await chai.request.execute(server.app)
        .put("/voc")
        .send(Object.assign({}, scheme, patch))
      res.should.have.status(200)
      res.body.should.be.an("object")
      assert.deepStrictEqual(res.body.notation, patch.notation)
      // Make sure created was NOT updated even though it was set on patch
      assert.strictEqual(res.body.created, scheme.created)
      assert.notStrictEqual(res.body.created, patch.created)
      // Make sure modified was updated
      assert.notStrictEqual(res.body.modified, scheme.modified)
    })

    it("should not PUT an invalid scheme", done => {
      const patch = {
        notation: "A",
      }
      chai.request.execute(server.app)
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
      chai.request.execute(server.app)
        .put("/voc")
        .send({
          uri: "urn:test:scheme-that-does-not-exist",
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
      chai.request.execute(server.app)
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
      chai.request.execute(server.app)
        .delete("/voc")
        .query({
          uri: "urn:test:scheme-that-does-not-exist",
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

  describe("/concepts write access", () => {

    const concept = {
      uri: "urn:test:concept",
      inScheme: [schemes[0]],
    }

    const concepts = [
      {
        uri: "urn:test:concept2",
        topConceptOf: [schemes[1]],
      },
      {
        uri: "urn:test:concept3",
        inScheme: [schemes[0]],
        broader: [concept],
      },
    ]

    it("should POST a concept", done => {
      chai.request.execute(server.app)
        .post("/concepts")
        .send(concept)
        .end((error, res) => {
          res.should.have.status(201)
          res.body.should.be.a("object")
          assert.equal(res.body.uri, concept.uri)
          done()
        })
    })

    it("should have refreshed the `concepts` property of the scheme after POSTing a concept", done => {
      chai.request.execute(server.app)
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
      chai.request.execute(server.app)
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
      chai.request.execute(server.app)
        .post("/concepts")
        .send(concepts)
        .end((error, res) => {
          res.should.have.status(201)
          res.body.should.be.an("array")
          assert.deepEqual(res.body.map(c => c.uri), concepts.map(c => c.uri))
          done()
        })
    })

    it("should have refreshed the `topConcepts` property of the scheme after POSTing a top concept", done => {
      chai.request.execute(server.app)
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
      chai.request.execute(server.app)
        .post("/concepts")
        .send({
          uri: "urn:test:concept-without-scheme",
        })
        .end((error, res) => {
          res.should.have.status(400)
          res.body.should.be.a("object")
          assert.equal(res.body.error, "MalformedRequestError")
          done()
        })
    })

    it("should POST a concept without scheme when scheme param is given, then delete it", async () => {
      const scheme = schemes[0]
      const concept = {
        uri: "urn:test:concept-without-scheme",
      }
      let res
      // POST concept
      res = await chai.request.execute(server.app)
        .post("/concepts")
        .query({
          scheme: scheme.uri,
        })
        .send(concept)
      res.should.have.status(201)
      res.body.should.be.a("object")
      assert.strictEqual(res.body.uri, concept.uri)
      assert.strictEqual(res.body.inScheme[0].uri, scheme.uri)
      // DELETE concept
      res = await chai.request.execute(server.app)
        .delete("/concepts")
        .query(concept)
      res.should.have.status(204)
    })

    it("should not POST a concept with invalid URI", done => {
      chai.request.execute(server.app)
        .post("/concepts")
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
      chai.request.execute(server.app)
        .post("/concepts")
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
      chai.request.execute(server.app)
        .post("/concepts")
        .send(concept)
        .end((error, res) => {
          assert.equal(error, null)
          res.should.have.status(422)
          res.body.should.be.an("object")
          assert.equal(res.body.error, "DuplicateEntityError")
          done()
        })
    })

    it("should POST a single concept that already exists if bulk is set", done => {
      chai.request.execute(server.app)
        .post("/concepts")
        .query({
          bulk: true,
        })
        .send(concept)
        .end((error, res) => {
          assert.equal(error, null)
          res.should.have.status(201)
          res.body.should.be.an("object")
          done()
        })
    })

    it("should POST upsert multiple concepts", done => {
      chai.request.execute(server.app)
        .post("/concepts")
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
      chai.request.execute(server.app)
        .post("/concepts")
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
      chai.request.execute(server.app)
        .post("/concepts")
        .send({
          uri: "urn:test:concept-with-missing-scheme",
          inScheme: [
            {
              uri: "urn:test:scheme-that-does-not-exist",
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
      chai.request.execute(server.app)
        .put("/concepts")
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
      chai.request.execute(server.app)
        .put("/concepts")
        .send({
          uri: "urn:test:concept2",
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
      chai.request.execute(server.app)
        .put("/concepts")
        .send({
          uri: "urn:test:concept-that-does-not-exist",
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
        chai.request.execute(server.app)
          .delete("/concepts")
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
      chai.request.execute(server.app)
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
      chai.request.execute(server.app)
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
      chai.request.execute(server.app)
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

    it("should DELETE all concepts of a scheme", async () => {
      const uri = concepts[0].topConceptOf[0].uri
      let res
      // Post concept
      res = await chai.request.execute(server.app)
        .post("/concepts")
        .send(concepts[0])
      res.should.have.status(201)
      res.body.should.be.an("object")
      res.body.uri.should.be.eql(concepts[0].uri)
      // Delete from scheme
      res = await chai.request.execute(server.app)
        .delete("/voc/concepts")
        .query({
          uri,
        })
      res.should.have.status(204)
      // Get from scheme
      res = await chai.request.execute(server.app)
        .get("/voc/concepts")
        .query({ uri })
      res.should.have.status(200)
      res.body.should.be.a("array")
      res.body.length.should.be.eql(0)
    })

    it("should not DELETE a concept that doesn't exist", done => {
      chai.request.execute(server.app)
        .delete("/concepts")
        .query({
          uri: "urn:test:concept-that-does-not-exist",
        })
        .end((error, res) => {
          res.should.have.status(404)
          res.body.should.be.a("object")
          assert.equal(res.body.error, "EntityNotFoundError")
          done()
        })
    })

    it("should POST a concept, update its scheme's properties, then DELETE the concept", async () => {
      const uri = concepts[0].topConceptOf[0].uri
      const concept = {
        uri: "urn:test:concept",
        topConceptOf: [{ uri }],
      }
      const getScheme = async () => {
        const res = await chai.request.execute(server.app)
          .get("/voc")
          .query({
            uri,
          })
        assert.strictEqual(res.status, 200)
        assert.strictEqual(res.body.length, 1)
        return res
      }
      let res, scheme
      // Get scheme before POSTing
      res = await getScheme()
      scheme = res.body[0]
      assert.strictEqual(scheme.uri, uri)
      // POST concept
      res = await chai.request.execute(server.app)
        .post("/concepts")
        .send(concept)
      assert.strictEqual(res.status, 201)
      // Check scheme after POSTing
      res = await getScheme()
      // Check concepts, topConcepts, and modified properties
      assert.notDeepStrictEqual(res.body.concepts, scheme.concepts)
      assert.notDeepStrictEqual(res.body.topConcepts, scheme.topConcepts)
      assert.notStrictEqual(res.body.modified, scheme.modified)
      scheme = res.body[0]
      // DELETE concept
      res = await chai.request.execute(server.app)
        .delete("/concepts")
        .query({
          uri: concept.uri,
        })
      assert.strictEqual(res.status, 204)
      // Check scheme after DELETE
      res = await getScheme()
      // Check concepts, topConcepts, and modified properties
      assert.notDeepStrictEqual(res.body.concepts, scheme.concepts)
      assert.notDeepStrictEqual(res.body.topConcepts, scheme.topConcepts)
      assert.notStrictEqual(res.body.modified, scheme.modified)
    })

  })

})