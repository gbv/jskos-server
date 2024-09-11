import assert from "node:assert"
import { loadESLint } from "eslint"

const DefaultESLint = await loadESLint()
const eslint = new DefaultESLint()
const results = await eslint.lintFiles([
  "**/*.js",
])

describe("ESLint Errors", () => {

  results.forEach(result => {
    it(result.filePath, (done) => {
      assert(
        result.errorCount === 0,
        "\n" + result.messages.map(m => `\t\t${m.line}:${m.column}\terror\t${m.message}\t${m.ruleId}`).join("\n"),
      )
      done()
    })
  })

})
