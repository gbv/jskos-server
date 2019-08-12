const _ = require("lodash")

// Load default config
const configDefault = require("./config.default.json")
// Current environment
const env = process.env.NODE_ENV || "development"
// Load environment config
let configEnv
try {
  configEnv = require(`./config.${env}.json`)
} catch(error) {
  configEnv = {}
}
// Load user config
let configUser
try {
  configUser = require("./config.json")
} catch(error) {
  configUser = {}
}

let config = _.defaultsDeep({ env }, configEnv, configUser, configDefault)

// Set composed config variables
config.mongo.auth = config.mongo.user ? `${config.mongo.user}:${config.mongo.pass}@` : ""
config.mongo.url = `mongodb://${config.mongo.auth}${config.mongo.host}:${config.mongo.port}`
// Adjust database name during tests
if (env === "test") {
  config.mongo.db += "-test"
}

// Set baseUrl to localhost if not set
if (!config.baseUrl) {
  config.baseUrl = `http://localhost:${config.port}`
}

config.log = (...args) => {
  if (env != "test" && config.verbosity) {
    console.log(...args)
  }
}
config.warn = (...args) => {
  if (env != "test" && config.verbosity) {
    console.warn(...args)
  }
}
config.error = (...args) => {
  if (env != "test" && config.verbosity) {
    console.error(...args)
  }
}

module.exports = config
