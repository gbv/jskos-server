// Tests for utilities

const assert = require("assert")
const utils = require("../utils")

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
    const tests = [
      // Everything undefined
      {},
      // For null-ish values, keep the valye
      {
        object: null,
        expected: null,
      },
      // Everything empty
      {
        object: {},
        expected: {},
      },
      // Remove creator and contributor from object
      {
        object: {
          creator: "value doesn't matter",
          contributor: "value doesn't matter",
        },
        expected: {},
      },
      // Set creator for POST
      {
        object: {},
        creator: { uri: "test" },
        req: { method: "POST" },
        expected: {
          creator: [{ uri: "test" }],
        },
      },
      // Set creator for annotation
      {
        object: { creator: {} },
        creator: { uri: "test" },
        req: {
          method: "PUT",
          type: "annotations",
        },
        expected: {
          creator: { uri: "test" },
        },
      },
      // Keep existing creator and contributor
      {
        object: {},
        req: {
          method: "PATCH",
        },
        existing: {
          creator: "creator",
          contributor: "contributor",
        },
        expected: {
          creator: "creator",
          contributor: "contributor",
        },
      },
      // Set creator and contributor
      {
        object: {},
        req: {
          method: "PUT",
        },
        creator: {
          uri: "test",
        },
        existing: {},
        expected: {
          creator: [{ uri: "test" }],
          contributor: [{ uri: "test" }],
        },
      },
      // Set contributor
      {
        object: {},
        req: {
          method: "PUT",
        },
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
      // Set creator, push to contributor
      {
        object: {},
        req: {
          method: "PUT",
        },
        creator: {
          uri: "test",
        },
        existing: {
          contributor: [{}],
        },
        expected: {
          creator: [{ uri: "test" }],
          contributor: [{}, { uri: "test" }],
        },
      },
      // Adjust existing creator entry
      {
        object: {},
        req: {
          method: "PUT",
          user: {
            uri: "test",
            identities: {
              test: {
                uri: "testAlternative",
              },
            },
          },
        },
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
          contributor: [{
            uri: "test",
            prefLabel: { en: "name" },
          }],
        },
      },
      // Adjust existing contributor entry, push to end
      {
        object: {},
        req: {
          method: "PUT",
          user: {
            uri: "test",
            identities: {
              test: {
                uri: "testAlternative",
              },
            },
          },
        },
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

})
