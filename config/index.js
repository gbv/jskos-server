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
  // Don't load user config for test environment
  if (env == "test") {
    throw new Error()
  }
  configUser = require("./config.json")
} catch(error) {
  configUser = {}
}

// Before merging, check whether `namespace` exists in the user config and if not, generate a namespace and save it to user config
if (!configUser.namespace && env != "test") {
  const fs = require("fs")
  const path = require("path")
  const uuid = require("uuid/v4")()
  configUser.namespace = uuid
  fs.writeFileSync(path.resolve(__dirname, "config.json"), JSON.stringify(configUser, null, 2))
  console.log("Config: Created a namespace and wrote it to config/config.json.")
}

let config = _.defaultsDeep({ env }, configEnv, configUser, configDefault)

// Logging functions
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

// Set composed config variables
config.mongo.auth = config.mongo.user ? `${config.mongo.user}:${config.mongo.pass}@` : ""
config.mongo.url = `mongodb://${config.mongo.auth}${config.mongo.host}:${config.mongo.port}`
// Adjust database name during tests
if (env === "test") {
  config.mongo.db += "-test"
}

// Set baseUrl to localhost if not set
if (!config.baseUrl) {
  config.baseUrl = `http://localhost:${config.port}/`
}
if (!config.baseUrl.endsWith("/")) {
  config.baseUrl += "/"
}

// Set version if not set
if (!config.version) {
  config.version = require("../package.json").version
}

// Check for configuration that is not yet supported or implemented
for (let type of ["schemes", "concepts"]) {
  if (config[type] && !_.isBoolean(config[type])) {
    config.warn(`Unsupported config in key \`${type}\`: Currently only read without auth is supported. Options will be ignored.`)
  }
}

// Further expansion of config
const defaultActions = {
  read: {
    auth: false,
  },
  create: {
    auth: true,
  },
  update: {
    auth: true,
    crossUser: false,
  },
  delete: {
    auth: true,
    crossUser: false,
  },
}
for (let type of ["schemes", "concepts", "mappings", "concordances", "annotations"]) {
  if (config[type] === true) {
    // Default is read-only without authentication
    config[type] = {
      read: {
        auth: false,
      },
    }
  }
  if (config[type]) {
    for (let action of ["read", "create", "update", "delete"]) {
      if (config[type][action] === true) {
        config[type][action] = defaultActions[action]
      }
      // Fill identities and identityProviders if necessary (not for read)
      if (config[type][action] && action != "read") {
        for (let prop of ["identities", "identityProviders"]) {
          if (config[type][action][prop] === undefined) {
            const value = config[type][prop] || config[prop]
            if (value) {
              config[type][action][prop] = value
            }
          }
        }
      }
    }
    // If anonymous is given, assume crossUser for update and delete
    if (type == "mappings" && config[type].anonymous) {
      if (config[type].update) {
        config[type].update.crossUser = true
      }
      if (config[type].delete) {
        config[type].delete.crossUser = true
      }
    }
  }
}

// Compatibility with older config (will be removed after clients have been updated!)
// canSaveMappings
config.auth.canSaveMappings = !!(config.mappings && config.mappings.create)
// canRemoveMappings
config.auth.canRemoveMappings = !!(config.mappings && config.mappings.delete)
if (config.auth.canSaveMappings) {
  // postAuthRequired
  config.auth.postAuthRequired = config.mappings.create.auth
  // allowCrossUserEditing
  config.auth.allowCrossUserEditing = !!(config.mappings.update && config.mappings.update.crossUser)
}
// whitelist
if (config.mappings && config.mappings.create && config.mappings.create.identities) {
  config.auth.whitelist = config.mappings.create.identities
}

module.exports = config
