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

console.log(`running in ${env} mode`)

const log = (...args) => {
  if (env != "test" || config.verbosity) {
    console.log(...args)
  }
}
config.log = log

if (!config.auth.postAuthRequired) {
  log("Note: POST /mappings does not require authentication. To change this, remove `auth.postAuthRequired` from the configuration file.")
}
if (!config.baseUrl) {
  log("Warning: If you're using jskos-server behind a reverse proxy, it is necessary to add `baseUrl` to the configuration file!")
}

module.exports = config
