// Tests for utilities

import assert from "node:assert"
import { handleCreatorForObject } from "../routes/utils.js"
import { getCreator } from "../utils/users.js"
import { cleanJSON } from "../utils/clean-json.js"

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
        const actual = getCreator(Object.assign({ query: {} }, req))
        // For non-annotations, creator should be an array if defined
        assert.deepStrictEqual(actual, expected)
      })
      index += 1
    }

    it("should fail if req is undefined", async () => {
      assert.throws(() => {
        getCreator()
      })
    })

    it("should fail if req.query is undefined", async () => {
      assert.throws(() => {
        getCreator({})
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
      // Allow any kind of values if auth is false
      {
        object: { creator: [{ uri: "abc " }], contributor: [] },
        expected: { creator: [{ uri: "abc " }], contributor: [] },
        req: Object.assign(reqWithMethod("POST"), { auth: false }),
        // Should be ignored
        creator: { uri: "test" },
      },
      // Always remove creator/contributor from payload when anonymous is true, but don't change existing values
      {
        object: { creator: [{ uri: "abc " }], contributor: [] },
        existing: { creator: [{ uri: "def" }], contributor: [{ uri: "ghj" }] },
        expected: { creator: [{ uri: "def" }], contributor: [{ uri: "ghj" }] },
        req: Object.assign(reqWithMethod("PUT"), { anonymous: true }),
      },
    ]
    let index = 0
    for (let { expected, ...options } of tests) {
      it(`should pass test[${index}]`, async () => {
        const actual = handleCreatorForObject(Object.assign({ req: {} }, options))
        // Should return object reference
        assert.strictEqual(actual, options.object)
        // Check if content is correct as well
        assert.deepStrictEqual(actual, expected)
      })
      index += 1
    }
  })

  it("cleanJSON", () => {
    const input = {
      _a: 1,
      b: {},
      c: [],
      d: 2,
    }
    const output = {
      b: {},
      c: [],
      d: 2,
    }

    cleanJSON(input, 0)
    assert.deepEqual(input, output)
  })

})
