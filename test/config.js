import fs from "node:fs"
import assert from "node:assert"
import { ajv, configSchema, ajvErrorsToString } from "./ajv.js"

describe("Configuration", () => {

  for (let file of [
    "config/config.default.json",
    "config/config.test.json",
  ].concat(fs.readdirSync("./test/configs").map(f => `test/configs/${f}`))) {
    const shouldFail = file.includes("fail-")
    it(`should ${shouldFail ? "not " : ""}validate ${file}`, async () => {
      let valid = false
      try {
        const data = JSON.parse(fs.readFileSync(file))
        valid = ajv.validate(configSchema, data)
      } catch (error) {
        // Ignore error
      }
      if (shouldFail) {
        assert.ok(!valid, "File passed validation even though it shouldn't.")
      } else {
        const notValidMessage = ajvErrorsToString(ajv.errors || [])
        assert.ok(valid, notValidMessage)
      }
    })
  }

})


