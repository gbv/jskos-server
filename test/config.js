import fs from "node:fs"
import assert from "node:assert"
import { validateConfig, setupConfig } from "../config/setup.js"

describe("Configuration", () => {
  for (let file of [
    "config/config.default.json",
    "config/config.test.json",
  ].concat(fs.readdirSync("./test/configs").map(f => `test/configs/${f}`))) {
    const shouldFail = file.includes("fail-")
    it(`should ${shouldFail ? "not validate" : "validate and setup"} ${file}`, () => {
      let config
      try {
        config = JSON.parse(fs.readFileSync(file))
      } catch { /* ignore */ }
      if (shouldFail) {
        assert.throws(() => validateConfig(config))
      } else {
        validateConfig(config)
        setupConfig(config)
        assert.ok(config)
        assert.ok(config.log)
      }
    })
  }
})
