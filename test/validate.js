// Tests for /validate endpoints

const chai = require("chai")
const chaiAsPromised = require("chai-as-promised")
chai.use(chaiAsPromised)
const chaiHttp = require("chai-http")
chai.use(chaiHttp)
// eslint-disable-next-line no-unused-vars
const should = chai.should()
const server = require("../server")

const glob = require("glob")
const fs = require("fs")

const assert = require("assert")

let types = ["resource", "item", "concept", "scheme", "mapping", "concordance", "registry", "distribution", "occurrence", "bundle", "annotation"]
let examples = {}

// Import local examples
for (let type of types) {
  examples[type] = []
  for (let expected of [true, false]) {
    let files = glob.sync(`./node_modules/jskos-validate/examples/${type}/${expected ? "pass" : "fail"}/*.json`)
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

describe("Validation endpoint", () => {

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
            chai.request(server.app)
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
