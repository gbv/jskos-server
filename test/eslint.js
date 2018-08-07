const lint = require("mocha-eslint")

// ESLint as part of the tests
let paths = [
  "*.js",
  "test/*.js",
  "lib/*.js"
]
let options = {
  contextName: "ESLint"
}
lint(paths, options)
