import chai from "./chai.js"

import { app } from "../server.js"
import assert from "node:assert"
import { assertIndexes, assertMongoDB, dropDatabaseBeforeAndAfter, setupInMemoryMongo, createCollectionsAndIndexes, teardownInMemoryMongo } from "./test-utils.js"

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

describe("/mappings/{infer,apply}", () => {
  const storeMappings = mappings => chai.request.execute(app)
    .post("/mappings")
    .set("Authorization", `Bearer ${token}`)
    .send(mappings)

  const inferMappings = query => chai.request.execute(app)
    .get("/mappings/infer")
    .query(query)

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

  describe("/mappings/infer", () => {
    const schemeTargetScheme = [scheme, targetScheme]
    schemeTargetScheme.forEach(s => {
      it("should POST test scheme", done => {
        scheme.API = [
          {
            type: "http://bartoc.org/api-type/jskos",
            url: `http://localhost:${config.port}`,
          },
        ],
        chai.request.execute(app)
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
      chai.request.execute(app)
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
      inferMappings({
        from: concepts.at(-1).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
      }).end((error, res) => {
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
      storeMappings(mapping).end((err, res) => {
        assert.equal(res.status, 201)
        const mappingUri = res.body.uri
        inferMappings({
          from: concepts.at(-1).uri,
          fromScheme: scheme.uri,
          toScheme: targetScheme.uri,
        }).end((error, res) => {
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
      inferMappings({
        from: concepts.at(-1).uri.replace(scheme.namespace, ""),
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
      }).end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 1)
        done()
      })
    })

    it("should return nothing for previous request if depth is set to 1", done => {
      inferMappings({
        from: concepts.at(-1).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        depth: 1,
      }).end((error, res) => {
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
      storeMappings(mapping).end((err, res) => {
        assert.equal(res.status, 201)
        const mappingUri = res.body.uri
        inferMappings({
          from: concepts.at(-1).uri,
          fromScheme: scheme.uri,
          toScheme: targetScheme.uri,
        }).end((error, res) => {
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
      inferMappings({
        from: concepts.at(-1).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        depth: 0,
      }).end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 0)
        done()
      })
    })

    it("should not use mapping of type `closeMatch` for inference if parameter `strict` is set", done => {
      inferMappings({
        from: concepts.at(-1).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        strict: "true",
      }).end((error, res) => {
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
        from: { memberSet: [concepts.at(-1)] },
        fromScheme: scheme,
        to: { memberSet: [{ uri: `${targetScheme.uri}:7` }] },
        toScheme: targetScheme,
        type: ["http://www.w3.org/2004/02/skos/core#exactMatch"],
      }
      storeMappings(mapping).end((err, res) => {
        assert.equal(res.status, 201)
        const mappingUri = res.body.uri
        inferMappings({
          from: concepts.at(-1).uri,
          fromScheme: scheme.uri,
          toScheme: targetScheme.uri,
          depth: 0,
        }).end((error, res) => {
          res.should.have.status(200)
          res.body.should.be.an("array")
          assert.equal(res.body.length, 1)
          assert.equal(res.body[0].uri, mappingUri)
          done()
        })
      })
    })


    it("should return empty result when mappings of type `broadMatch` are requested", done => {
      inferMappings({
        from: concepts.at(-1).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        type: "http://www.w3.org/2004/02/skos/core#broadMatch",
      }).end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 0)
        done()
      })
    })

    it("should throw error when parameter `to` is given", done => {
      inferMappings({
        from: concepts.at(-1).uri,
        fromScheme: scheme.uri,
        to: "test",
        toScheme: targetScheme.uri,
      }).end((error, res) => {
        res.should.have.status(400)
        done()
      })
    })

    it("should throw error when parameter `direction` is given with value `backward`", done => {
      inferMappings({
        from: concepts.at(-1).uri,
        fromScheme: scheme.uri,
        toScheme: targetScheme.uri,
        direction: "backward",
      }).end((error, res) => {
        res.should.have.status(400)
        done()
      })
    })

  })

  describe("/mappings/infer?via", () => {
    const viaScheme = { uri: "http://example.org/via/" }
    const viaConcept = { uri: `${viaScheme.uri}123` }
    const targetConcept = { uri: `${targetScheme.uri}:123` }
    const mappings = [{
      from: { memberSet: [ concepts[0] ] },
      fromScheme: scheme,
      to: { memberSet: [ viaConcept ] },
      toScheme: viaScheme,
      type: ["http://www.w3.org/2004/02/skos/core#exactMatch"],
    },{
      from: { memberSet: [ viaConcept ] },
      fromScheme: viaScheme,
      to: { memberSet: [ targetConcept ] },
      toScheme: targetScheme,
      type: ["http://www.w3.org/2004/02/skos/core#exactMatch"],
    }]

    before(async () => {
      // concepts are not required to exist in the database but concept schemes
      await chai.request.execute(app).post("/voc").send(viaScheme)
      storeMappings(mappings).end((err, res) => {
        assert.equal(res.status, 201)
        for (let i=0; i<mappings.length; i++) {
          mappings[i].uri = res.body[i].uri
        }
      })
    })

    it("should throw error when parameter `depth` is given", done => {
      inferMappings({
        from: concepts[0].uri,
        via: "http://example.org/404",
        depth: 1,
      }).end((error, res) => {
        res.should.have.status(400)
        done()
      })
    })

    it("should return empty set if via is not found", done => {
      inferMappings({
        from: concepts[0].uri,
        via: "http://example.org/404",
      }).end((error, res) => {
        res.should.have.status(200)
        res.body.should.be.an("array")
        assert.equal(res.body.length, 0)
        done()
      })
    })

    it("should return inferred mappings", done => {
      inferMappings({
        from: concepts[0].uri,
        via: viaScheme.uri,
      }).end((error, res) => {
        res.should.have.status(200)
        assert.deepEqual(res.body, [{
          type: [ "http://www.w3.org/2004/02/skos/core#exactMatch" ],
          from: "urn:test:source-scheme:1",
          to: { memberSet: [ { uri: targetConcept.uri } ] },
          toScheme: { uri: "urn:test:target-scheme" },
          source: [ { uri: mappings[0].uri }, { uri: mappings[1].uri } ],
          justification: "https://w3id.org/semapv/vocab/MappingChaining",
          "@context": "https://gbv.github.io/jskos/context.json",
        }])
        done()
      })
    })
  })

  describe("/mappings/apply", () => {
    const data = [
      { uri: `${scheme.uri}:2` },
      { uri: concepts.at(-1).uri },
      { uri: concepts.at(-1).uri },
      {},
    ]

    const uri = concepts.at(-1).uri
    const extraTargetUri = `${targetScheme.uri}:8`

    before(async () => {
      const mapping = {
        from: { memberSet: [{ uri: `${scheme.uri}:3` }] },
        fromScheme: scheme,
        to: { memberSet: [{ uri: extraTargetUri }] },
        toScheme: targetScheme,
        type: ["http://www.w3.org/2004/02/skos/core#exactMatch"],
      }
      const res = await storeMappings(mapping)
      res.should.have.status(201)
    })

    it("should apply mapping (GET)", done => {
      chai.request.execute(app)
        .get("/mappings/apply")
        .query({from: `${uri}|x:y`})
        .end((error, res) => {
          res.should.have.status(200)
          res.body.should.be.an("array")
          assert.equal(res.body.length, 1)
          assert.ok(res.body[0]?.MAPPING)
          done()
        })
    })

    it("should apply mapping (POST)", done => {
      chai.request.execute(app)
        .post("/mappings/apply")
        .send(data)
        .end((error, res) => {
          res.should.have.status(200)
          res.body.should.be.an("array")
          assert.equal(res.body.length, 5)
          assert.deepStrictEqual(res.body.slice(0,4), data)
          assert.equal(res.body[4].uri, "urn:test:target-scheme:7")
          done()
        })
    })

    it("should combine body and toScheme filters when applying mappings", async () => {
      const res = await chai.request.execute(app)
        .post("/mappings/apply")
        .query({ toScheme: targetScheme.uri })
        .send([{ uri }])

      res.should.have.status(200)
      res.body.should.be.an("array")
      assert.deepStrictEqual(res.body.map(item => item.uri), [uri, `${targetScheme.uri}:7`])
    })

    it("should not add targets for an unknown body item when toScheme is given", async () => {
      const body = [
        {
          uri: "http://example.org/not-ddc",
          inScheme: [{ uri: "http://example.org/scheme" }],
          notation: ["x"],
        },
      ]
      const res = await chai.request.execute(app)
        .post("/mappings/apply")
        .query({ toScheme: targetScheme.uri })
        .send(body)

      res.should.have.status(200)
      assert.deepStrictEqual(res.body, body)
    })
  })
})
