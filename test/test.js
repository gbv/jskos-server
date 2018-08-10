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

  describe("GET /voc", () => {

    it("should GET an empty array", done => {
      chai.request(server.app)
        .get("/voc")
        .end((err, res) => {
          res.should.have.status(200)
          res.body.should.be.a("array")
          res.body.length.should.be.eql(0)
          done()
        })
    })

    it("should GET one vocabulary", done => {
      // Add one vocabulary to database
      exec("NODE_ENV=test npm run import -- -t ./test/terminologies/terminologies.json", (err) => {
        if (err) {
          done(err)
          return
        }
        chai.request(server.app)
          .get("/voc")
          .end((err, res) => {
            res.should.have.status(200)
            res.body.should.be.a("array")
            res.body.length.should.be.eql(1)
            done()
          })
      })
    })

  })

  describe("GET /mappings", () => {

    it("should GET an empty array", done => {
      chai.request(server.app)
        .get("/mappings")
        .end((err, res) => {
          res.should.have.status(200)
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

  describe("GET /ancestors", () => {

    it("should GET correct results when using properties=narrower", done => {
      // Add concepts to database
      exec("NODE_ENV=test npm run import -- -r -c ./test/concepts/concepts-ddc-6-60-61-62.json", (err) => {
        if (err) {
          done(err)
          return
        }
        chai.request(server.app)
          .get("/ancestors")
          .query({
            uri: "http://dewey.info/class/60/e23/",
            properties: "narrower"
          })
          .end((err, res) => {
            res.should.have.status(200)
            res.body.should.be.a("array")
            res.body.length.should.be.eql(1)
            res.body[0].narrower.should.be.a("array")
            res.body[0].narrower.length.should.be.eql(3)
            done()
          })
      })
    })

  })

})
