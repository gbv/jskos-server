const chai = require("chai")
const chaiAsPromised = require("chai-as-promised")
chai.use(chaiAsPromised)
const chaiHttp = require("chai-http")
chai.use(chaiHttp)
// eslint-disable-next-line no-unused-vars
const should = chai.should()
const server = require("../server")
const exec = require("child_process").exec

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

  beforeEach(done => {
    // Empty database before testing
    exec("NODE_ENV=test npm run import -- -r", (err) => {
      if (err) {
        console.error("Error: Clearing database failed.")
      }
      done(err)
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

})
