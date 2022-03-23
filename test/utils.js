// Tests for utilities

const assert = require("assert")
const utils = require("../utils")
const config = require("../config")

describe("utils", () => {

  describe("getCreator", () => {
    const tests = [
      {
        req: {},
        creator: null,
      },
      {
        req: {
          user: {
            uri: "test",
          },
        },
        creator: {
          uri: "test",
        },
      },
      {
        req: {
          user: {
            uri: "test",
          },
          query: {
            identity: "test2",
          },
        },
        creator: {
          uri: "test",
        },
      },
      {
        req: {
          user: {
            uri: "test",
            identities: {
              test2: { uri: "test2" },
            },
          },
          query: {
            identity: "test2",
          },
        },
        creator: {
          uri: "test2",
        },
      },
      {
        req: {
          user: {
            uri: "test",
            identities: {
              test2: {
                uri: "test2",
                name: "name2",
              },
            },
          },
          query: {
            identity: "test2",
          },
        },
        creator: {
          uri: "test2",
          prefLabel: { en: "name2" },
        },
      },
      {
        req: {
          type: "annotations",
          user: {
            uri: "test",
            identities: {
              test2: {
                uri: "test2",
                name: "name2",
              },
            },
          },
          query: {
            identity: "test2",
          },
        },
        creator: {
          id: "test2",
          name: "name2",
        },
      },
      {
        req: {
          user: {
            uri: "test",
            identities: {
              test2: {
                uri: "test2",
                name: "name2",
              },
            },
          },
          query: {
            identity: "test2",
            identityName: "",
          },
        },
        creator: {
          uri: "test2",
        },
      },
      {
        req: {
          query: {
            identityName: "name",
          },
        },
        creator: {
          prefLabel: { en: "name" },
        },
      },
      {
        req: {
          user: {
            uri: "",
          },
        },
        creator: null,
      },
    ]
    let index = 0
    for (let { req, creator: expected } of tests) {
      it(`should pass test[${index}]`, async () => {
        const actual = utils.getCreator(Object.assign({ query: {} }, req))
        // For non-annotations, creator should be an array if defined
        assert.deepStrictEqual(actual, expected)
      })
      index += 1
    }

    it("should fail if req is undefined", async () => {
      assert.throws(() => {
        utils.getCreator()
      })
    })

    it("should fail if req.query is undefined", async () => {
      assert.throws(() => {
        utils.getCreator({})
      })
    })

  })

  describe("handleCreatorForObject", () => {
    const req = {
      anonymous: false,
      auth: true,
    }
    const reqWithMethod = (method) => Object.assign({ method }, req)
    const tests = [
      // Everything undefined
      {
        req,
      },
      // For null-ish values, keep the valye
      {
        object: null,
        expected: null,
        req,
      },
      // Everything empty
      {
        object: {},
        expected: {},
        req,
      },
      // No modifications without method/type
      {
        object: {
          creator: "value doesn't matter",
        },
        expected: {
          creator: "value doesn't matter",
        },
        req,
      },
      // Always remove contributor for annotations
      {
        object: {
          contributor: "value doesn't matter",
        },
        expected: {},
        req: Object.assign({
          type: "annotations",
        }, req),
      },
      // Set creator for POST
      {
        object: {},
        creator: { uri: "test" },
        req: reqWithMethod("POST"),
        expected: {
          creator: [{ uri: "test" }],
        },
      },
      // Set creator for annotation
      {
        object: { creator: {} },
        creator: { uri: "test" },
        req: Object.assign({
          type: "annotations",
        }, reqWithMethod("PUT")),
        expected: {
          creator: { uri: "test" },
        },
      },
      // Keep existing creator for PUT
      {
        object: {
          creator: "some creator",
        },
        req: reqWithMethod("PUT"),
        existing: {
          creator: "creator",
          contributor: "contributor",
        },
        expected: {
          creator: "creator",
        },
      },
      // Remove creator for PATCH
      {
        object: {
          creator: "some creator",
        },
        req: reqWithMethod("PATCH"),
        existing: {
          creator: "creator",
        },
        expected: {},
      },
      // Add to contributor for PUT/PATCH
      {
        object: {},
        req: reqWithMethod("PATCH"),
        creator: {
          uri: "test",
        },
        existing: {},
        expected: {
          contributor: [{ uri: "test" }],
        },
      },
      {
        object: {},
        req: reqWithMethod("PUT"),
        creator: {
          uri: "test",
        },
        existing: {
          creator: [{ uri: "other" }],
        },
        expected: {
          creator: [{ uri: "other" }],
          contributor: [{ uri: "test" }],
        },
      },
      // Adjust existing creator entry
      {
        object: {},
        req: Object.assign({
          user: {
            uri: "test",
            identities: {
              test: {
                uri: "testAlternative",
              },
            },
          },
        }, reqWithMethod("PUT")),
        creator: {
          uri: "test",
          prefLabel: { en: "name" },
        },
        existing: {
          creator: [{ uri: "testAlternative" }],
        },
        expected: {
          creator: [{
            uri: "test",
            prefLabel: { en: "name" },
          }],
        },
      },
      // Adjust existing contributor entry, push to end
      {
        object: {},
        req: Object.assign({
          user: {
            uri: "test",
            identities: {
              test: {
                uri: "testAlternative",
              },
            },
          },
        }, reqWithMethod("PUT")),
        creator: { uri: "test" },
        existing: {
          creator: [{}],
          contributor: [{ uri: "testAlternative" }, {}],
        },
        expected: {
          creator: [{}],
          contributor: [{}, { uri: "test" }],
        },
      },
    ]
    let index = 0
    for (let { expected, ...options } of tests) {
      it(`should pass test[${index}]`, async () => {
        const actual = utils.handleCreatorForObject(Object.assign({ req: {} }, options))
        // Should return object reference
        assert.strictEqual(actual, options.object)
        // Check if content is correct as well
        assert.deepStrictEqual(actual, expected)
      })
      index += 1
    }
  })

  describe("isQueryEmpty", () => {
    const tests = [
      {
        query: {},
        expected: true,
      },
      {
        query: { $and: [{}, {}] },
        expected: true,
      },
      {
        query: { $or: [{}, { $and: [{}, { $or: [{}] }] }] },
        expected: true,
      },
      {
        query: { a: 1 },
        expected: false,
      },
      {
        query: { $or: [{ $and: [{}] }, { $and: [{ a: 0 }] }] },
        expected: false,
      },
    ]
    let index = 0
    for (let { expected, query } of tests) {
      it(`should pass test[${index}]`, async () => {
        const actual = utils.isQueryEmpty(query)
        // Should return object reference
        assert.strictEqual(actual, expected)
      })
      index += 1
    }
  })

  describe("cleanJSON", () => {
    const prevClosedWorldAssumption = config.closedWorldAssumption

    const tests = [
      {
        closedWorldAssumption: false,
        input: {
          _a: 1,
          b: {},
          c: [],
          d: 2,
        },
        output: {
          d: 2,
        },
      },
      {
        closedWorldAssumption: true,
        input: {
          b: {},
          c: [],
        },
        output: {
          b: {},
          c: [],
        },
      },
      {
        closedWorldAssumption: false,
        input: [
          {
            _a: 1,
            b: {},
            c: [],
            d: null,
          },
        ],
        output: [
          {
            d: null,
          },
        ],
      },
      // Currently, only top-level properties are affected by closedWorldAssumption = false.
      // See: https://github.com/gbv/jskos-server/commit/123dc9da09f1e41f2263ee8a0f7faeefe67fa9ed#r67204606
      {
        closedWorldAssumption: false,
        input: {
          a: {
            b: {},
            _b: 1,
          },
        },
        output: {
          a: {
            b: {},
          },
        },
      },
    ]

    let index = 0
    for (let { closedWorldAssumption, input, output } of tests) {
      it(`should pass test[${index}]`, async () => {
        config.closedWorldAssumption = closedWorldAssumption
        utils.cleanJSON(input)
        assert.deepEqual(input, output)
      })
      index += 1
    }

    config.closedWorldAssumption = prevClosedWorldAssumption
  })

})
