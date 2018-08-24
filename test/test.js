const chai = require("chai")
const chaiAsPromised = require("chai-as-promised")
chai.use(chaiAsPromised)
const chaiHttp = require("chai-http")
chai.use(chaiHttp)
// eslint-disable-next-line no-unused-vars
const should = chai.should()
const server = require("../server")
const exec = require("child_process").exec
const _ = require("lodash")

// Hide UnhandledPromiseRejectionWarning on output
process.on("unhandledRejection", () => {})

describe("MongoDB", () => {

  it("should connect to database successfully", () => {
    return server.db.should.be.fulfilled
  })

  after(() => {
    server.db.then(db => {
      db.close()
    }).catch(() => {})
  })
})

describe("Express Server", () => {

  let clearDatabase = done => {
    // Empty database before testing
    exec("NODE_ENV=test npm run import -- -r", (err) => {
      if (err) {
        console.error("    x Error: Clearing database failed.")
      } else {
        console.log("    ✓ Cleared database")
      }
      done(err)
    })
  }

  before(clearDatabase)
  after(clearDatabase)

  describe("GET /status", () => {

    it("should GET status ok = 1", done => {
      chai.request(server.app)
        .get("/status")
        .end((err, res) => {
          res.should.have.status(200)
          res.body.should.be.a("object")
          _.get(res.body, "ok", 0).should.be.eql(1)
          done()
        })
    })

    it("should GET empty collections", done => {
      chai.request(server.app)
        .get("/status")
        .end((err, res) => {
          res.should.have.status(200)
          res.body.should.be.a("object")
          _.get(res.body, "collections.length", -1).should.be.eql(0)
          done()
        })
    })

  })

  describe("GET /mappings", () => {

    it("should GET an empty array", done => {
      chai.request(server.app)
        .get("/mappings")
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(0)
          done()
        })
    })

    it("should GET three mappings", done => {
      // Add mappings to database
      exec("NODE_ENV=test npm run import -- -m ./test/mappings/mapping-ddc-gnd.json", (err) => {
        if (err) {
          done(err)
          return
        }
        chai.request(server.app)
          .get("/mappings")
          .end((err, res) => {
            res.should.have.status(200)
            res.should.have.header("Link")
            res.should.have.header("X-Total-Count")
            res.body.should.be.a("array")
            res.body.length.should.be.eql(3)
            done()
          })
      })
    })

    it("should GET one mapping with URL parameter", done => {
      chai.request(server.app)
        .get("/mappings")
        .query({
          to: "http://d-nb.info/gnd/4499720-6"
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(1)
          _.get(res, "body[0].from.memberChoice[0].uri").should.be.eql("http://dewey.info/class/612.112/e22/")
          done()
        })
    })

    it("should GET only mappings from GND", done => {
      // Add mappings to database
      exec("NODE_ENV=test npm run import -- -r -m ./test/mappings/mappings-ddc.json", (err) => {
        if (err) {
          done(err)
          return
        }
        chai.request(server.app)
          .get("/mappings")
          .query({
            from: "612.112",
            to: "612.112",
            mode: "or",
            fromScheme: "GND"
          })
          .end((err, res) => {
            res.should.have.status(200)
            res.should.have.header("Link")
            res.should.have.header("X-Total-Count")
            res.body.should.be.a("array")
            res.body.length.should.be.eql(2)
            done()
          })
      })
    })

  })

  describe("GET /mappings/voc", () => {

    it("should GET appropriate results", done => {
      chai.request(server.app)
        .get("/mappings/voc")
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(3)
          done()
        })
    })

    it("should GET appropriate results with mode=and", done => {
      chai.request(server.app)
        .get("/mappings/voc")
        .query({
          from: "http://dewey.info/class/612.112/e23/",
          to: "http://rvk.uni-regensburg.de/nt/WW_8840",
          mode: "and"
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(2)
          let total = res.body.reduce((total, current) => {
            return total + (current.fromCount || 0) + (current.toCount || 0)
          }, 0)
          total.should.be.eql(2)
          done()
        })
    })

    it("should GET appropriate results with mode=or", done => {
      chai.request(server.app)
        .get("/mappings/voc")
        .query({
          from: "http://dewey.info/class/612.112/e23/",
          to: "http://rvk.uni-regensburg.de/nt/WW_8840",
          mode: "or"
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(2)
          let total = res.body.reduce((total, current) => {
            return total + (current.fromCount || 0) + (current.toCount || 0)
          }, 0)
          total.should.be.eql(8)
          done()
        })
    })

  })

  describe("GET /mappings/suggest", () => {

    it("should GET correct suggestions", done => {
      let search = "6"
      chai.request(server.app)
        .get("/mappings/suggest")
        .query({
          search
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(4)
          res.body[0].should.be.eql(search)
          res.body[1].should.be.a("array")
          res.body[1].length.should.be.eql(3)
          res.body[2].length.should.be.eql(3)
          res.body[3].length.should.be.eql(0)
          done()
        })
    })

  })

  describe("GET /voc", () => {

    it("should GET an empty array", done => {
      chai.request(server.app)
        .get("/voc")
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(0)
          done()
        })
    })

    it("should GET one vocabulary", done => {
      // Add a vocabulary and concepts to database
      exec("NODE_ENV=test npm run import -- -i -t ./test/terminologies/terminologies.json -c ./test/concepts/concepts-ddc-6-60-61-62.json", (err) => {
        if (err) {
          done(err)
          return
        }
        chai.request(server.app)
          .get("/voc")
          .end((err, res) => {
            res.should.have.status(200)
            res.should.have.header("Link")
            res.should.have.header("X-Total-Count")
            res.body.should.be.a("array")
            res.body.length.should.be.eql(1)
            done()
          })
      })
    })

  })

  describe("GET /voc/top", () => {

    it("should GET one top concept", done => {
      chai.request(server.app)
        .get("/voc/top")
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(1)
          res.body[0].should.be.a("object")
          res.body[0].uri.should.be.eql("http://dewey.info/class/6/e23/")
          done()
        })
    })

  })

  describe("GET /data", () => {

    it("should GET empty list when no URL is provided", done => {
      chai.request(server.app)
        .get("/data")
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(0)
          done()
        })
    })

    it("should GET one concept", done => {
      chai.request(server.app)
        .get("/data")
        .query({
          uri: "http://dewey.info/class/61/e23/"
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(1)
          res.body[0].should.be.a("object")
          res.body[0].prefLabel.de.should.be.eql("Medizin & Gesundheit")
          done()
        })
    })

    it("should GET multiple concepts", done => {
      chai.request(server.app)
        .get("/data")
        .query({
          uri: "http://dewey.info/class/60/e23/|http://dewey.info/class/61/e23/"
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(2)
          res.body[0].should.be.a("object")
          res.body[1].should.be.a("object")
          done()
        })
    })

  })

  describe("GET /narrower", () => {

    it("should GET three children", done => {
      chai.request(server.app)
        .get("/narrower")
        .query({
          uri: "http://dewey.info/class/6/e23/"
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(3)
          done()
        })
    })

  })

  describe("GET /ancestors", () => {

    it("should GET correct results when using properties=narrower", done => {
      chai.request(server.app)
        .get("/ancestors")
        .query({
          uri: "http://dewey.info/class/60/e23/",
          properties: "narrower"
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(1)
          res.body[0].narrower.should.be.a("array")
          res.body[0].narrower.length.should.be.eql(3)
          done()
        })
    })

  })

  describe("GET /suggest", () => {

    it("should GET correct results for notation", done => {
      chai.request(server.app)
        .get("/suggest")
        .query({
          search: "60"
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
          res.body[1][0].should.be.eql("60 Technik")
          res.body[3].should.be.a("array")
          res.body[3].length.should.be.eql(1)
          res.body[3][0].should.be.eql("http://dewey.info/class/60/e23/")
          done()
        })
    })

    it("should GET correct results for term", done => {
      chai.request(server.app)
        .get("/suggest")
        .query({
          search: "techn"
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
          done()
        })
    })

  })

  describe("GET /search", () => {

    it("should GET correct results for notation", done => {
      chai.request(server.app)
        .get("/search")
        .query({
          search: "60"
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(1)
          res.body[0].prefLabel.de.should.be.eql("Technik")
          res.body[0].uri.should.be.eql("http://dewey.info/class/60/e23/")
          done()
        })
    })

    it("should GET correct results for term", done => {
      chai.request(server.app)
        .get("/search")
        .query({
          search: "techn"
        })
        .end((err, res) => {
          res.should.have.status(200)
          res.should.have.header("Link")
          res.should.have.header("X-Total-Count")
          res.body.should.be.a("array")
          res.body.length.should.be.eql(2)
          done()
        })
    })

  })

  describe("Import Script", () => {

    it("should clear the database", done => {
      // Clear database
      exec("NODE_ENV=test npm run import -- -r -t -c -m", (err) => {
        if (err) {
          done(err)
          return
        }
        let db
        server.db.then(result => {
          db = result
          let promises = []
          let collections = ["concepts", "mappings", "terminologies"]
          for (let collection of collections) {
            promises.push(db.collection(collection).find({}).toArray())
          }
          return Promise.all(promises)
        }).then(results => {
          for (let result of results) {
            result.length.should.be.eql(0)
          }
          done()
        }).catch(error => {
          done(error)
        })
      })
    })

    it("should create indexes", done => {
      // Create indexes
      exec("NODE_ENV=test npm run import -- -i -t -c -m", (err) => {
        if (err) {
          done(err)
          return
        }
        let db
        server.db.then(result => {
          db = result
          let promises = []
          let collections = ["concepts", "mappings"]
          for (let collection of collections) {
            promises.push(db.collection(collection).indexInformation())
          }
          return Promise.all(promises)
        }).then(results => {
          for (let result of results) {
            // There should be more than the _id index
            Object.keys(result).length.should.be.greaterThan(1)
          }
          done()
        }).catch(error => {
          done(error)
        })
      })
    })

    it("should import concepts", done => {
      // Add concepts to database
      exec("NODE_ENV=test npm run import -- -c ./test/concepts/concepts-ddc-6-60-61-62.json", (err) => {
        if (err) {
          done(err)
          return
        }
        server.db.then(db => {
          return db.collection("concepts").find({}).toArray()
        }).then(results => {
          results.length.should.be.eql(4)
          done()
        }).catch(error => {
          done(error)
        })
      })
    })

    it("should import terminologies", done => {
      // Add a vocabulary database
      exec("NODE_ENV=test npm run import -- -t ./test/terminologies/terminologies.json", (err) => {
        if (err) {
          done(err)
          return
        }
        server.db.then(db => {
          return db.collection("terminologies").find({}).toArray()
        }).then(results => {
          results.length.should.be.eql(1)
          done()
        }).catch(error => {
          done(error)
        })
      })
    })

    it("should import mappings", done => {
      // Add mappings to database
      exec("NODE_ENV=test npm run import -- -m ./test/mappings/mapping-ddc-gnd.json", (err) => {
        if (err) {
          done(err)
          return
        }
        server.db.then(db => {
          return db.collection("mappings").find({}).toArray()
        }).then(results => {
          results.length.should.be.eql(3)
          done()
        }).catch(error => {
          done(error)
        })
      })
    })

  })

})
