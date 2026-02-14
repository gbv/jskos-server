import assert from "node:assert"
import { isQueryEmpty } from "../services/abstract.js"

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
      const actual = isQueryEmpty(query)
      // Should return object reference
      assert.strictEqual(actual, expected)
    })
    index += 1
  }
})
