import _ from "lodash"
import { ajvErrorsToString } from "../utils/ajvErrorsToString.js"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import AJV from "ajv"
import addAjvFormats from "ajv-formats"
import { v4 as uuid } from "uuid"

// Prepare environment
import * as dotenv from "dotenv"
dotenv.config()
const env = process.env.NODE_ENV || "development"
const configFile = process.env.CONFIG_FILE || "./config.json"

function getDirname(url) {
  return path.dirname(fileURLToPath(url))
}
const __dirname = getDirname(import.meta.url)

// Get package.json
export const info = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json")))

// Adjust path if it's relative
let configFilePath
if (configFile.startsWith("/")) {
  configFilePath = configFile
} else {
  configFilePath = path.resolve(__dirname, configFile)
}

// If file doesn't exist, create it with an empty array
if (env !== "test" && !fs.existsSync(configFilePath)) {
  fs.writeFileSync(configFilePath, "{\"mongo\":{\"host\":\"mongo\"}}")
}

// Load default config
const configDefault = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./config.default.json")))
// Load environment config
let configEnv
try {
  configEnv = JSON.parse(fs.readFileSync(path.resolve(__dirname, `./config.${env}.json`)))
} catch(error) {
  configEnv = {}
}
// Load user config
let configUser = {}
try {
  configUser = JSON.parse(fs.readFileSync(configFilePath))
} catch(error) {
  console.warn(`Warning: Could not load configuration file from ${configFilePath}. The application might not behave as expected.`)
}
if (env == "test") {
  configUser = _.pick(configUser, ["mongo"])
}

// Validate environemnt and user config
const ajv = new AJV({ allErrors: true })
addAjvFormats(ajv)
const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./config.schema.json")))
ajv.addSchema(schema)
if (!ajv.validate(schema, configEnv)) {
  console.error(`Could not validate environemnt configuration: ${ajvErrorsToString(ajv.errors)}`)
  process.exit(1)
}
if (!ajv.validate(schema, configUser)) {
  console.error(`Could not validate user configuration: ${ajvErrorsToString(ajv.errors)}`)
  process.exit(1)
}

// Before merging, check whether `namespace` exists in the user config and if not, generate a namespace and save it to user config
if (!configUser.namespace && env != "test") {
  configUser.namespace = uuid()
  fs.writeFileSync(configFilePath, JSON.stringify(configUser, null, 2))
  console.log(`Info/Config: Created a namespace and wrote it to ${configFilePath}.`)
}

let config = _.defaultsDeep({ env }, configEnv, configUser, configDefault)

if (![true, false, "log", "warn", "error"].includes(config.verbosity)) {
  console.warn(`Invalid verbosity value "${config.verbosity}", defaulting to "${configDefault.verbosity}" instead.`)
  config.verbosity = configDefault.verbosity
}

// Logging functions
config.log = (...args) => {
  if (env != "test" && (config.verbosity === true || config.verbosity === "log")) {
    console.log(new Date(), ...args)
  }
}
config.warn = (...args) => {
  if (env != "test" && (config.verbosity === true || config.verbosity === "log" || config.verbosity === "warn")) {
    console.warn(new Date(), ...args)
  }
}
config.error = (...args) => {
  if (env != "test" && config.verbosity !== false) {
    console.error(new Date(), ...args)
  }
}
config.getDirname = getDirname

// Set composed config variables
config.mongo.auth = config.mongo.user ? `${config.mongo.user}:${config.mongo.pass}@` : ""
config.mongo.url = `mongodb://${config.mongo.auth}${config.mongo.host}:${config.mongo.port}`
// Adjust database name during tests
if (env === "test") {
  config.mongo.db += "-test-" + config.namespace
}

// Set baseUrl to localhost if not set
if (!config.baseUrl) {
  Object.defineProperty(config, "baseUrl", { get: function() { return `http://localhost:${this.port}/` } })
}
if (!config.baseUrl.endsWith("/")) {
  config.baseUrl += "/"
}

// Set JSKOS API version if not set
if (!config.version) {
  config.version = info.version.split(".").slice(0,2).join(".")
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
      // Fill identities, identityProviders, and ips if necessary (not for read)
      if (config[type][action] && action != "read") {
        for (let prop of ["identities", "identityProviders", "ips"]) {
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

// Adjust annotations.mismatchTagVocabulary to have the correct "API" field so that clients using cocoda-sdk can natively query it
if (config.annotations?.mismatchTagVocabulary) {
  if (!config.annotations?.mismatchTagVocabulary?.API?.[0]) {
    config.annotations.mismatchTagVocabulary.API = [
      {
        type: "http://bartoc.org/api-type/jskos",
        url: config.baseUrl,
      },
    ]
  } else {
    config.warn("annotations.mismatchTagVocabulary currently does not support loading concepts from an external API. It will be attempted to load concepts from this instance instead.")
  }
}

// Set data for status endpoint
Object.defineProperty(config, "status", { get: function() {
  const baseUrl = this.baseUrl
  let status = {
    config: _.omit(_.cloneDeep(config), ["verbosity", "port", "mongo", "namespace", "proxies", "ips"]),
  }
  // Remove `ips` property from all actions
  for (let type of ["schemes", "concepts", "mappings", "concordances", "annotations"]) {
    if (status.config[type]) {
      delete status.config[type].ips
      for (let action of ["read", "create", "update", "delete"]) {
        if (status.config[type][action]) {
          delete status.config[type][action].ips
        }
      }
    }
  }
  // Remove `key` from auth config if a symmetric algorithm is used
  if (["HS256", "HS384", "HS512"].includes(_.get(status, "config.auth.algorithm"))) {
    delete status.config.auth.key
  }
  status.config.baseUrl = baseUrl
  // Set all available endpoints to `null` first
  for (let type of [
    "data",
    "schemes",
    "top",
    "voc-search",
    "voc-suggest",
    "voc-concepts",
    "concepts",
    "narrower",
    "ancestors",
    "search",
    "suggest",
    "mappings",
    "concordances",
    "annotations",
  ]) {
    status[type] = null
  }
  status.data = `${baseUrl}data`
  if (status.config.schemes) {
    // Add endpoints related to schemes
    status.schemes = `${baseUrl}voc`
    status.top = `${baseUrl}voc/top`
    status["voc-search"] = `${baseUrl}voc/search`
    status["voc-suggest"] = `${baseUrl}voc/suggest`
    status["voc-concepts"] = `${baseUrl}voc/concepts`
  }
  if (status.config.concepts) {
    // Add endpoints related to concepts
    status.concepts = `${baseUrl}concepts`
    status.narrower = `${baseUrl}concepts/narrower`
    status.ancestors = `${baseUrl}concepts/ancestors`
    status.search = `${baseUrl}concepts/search`
    status.suggest = `${baseUrl}concepts/suggest`
  }
  if (status.config.mappings) {
    status.mappings = `${baseUrl}mappings`
  }
  if (status.config.concordances) {
    status.concordances = `${baseUrl}concordances`
  }
  if (status.config.annotations) {
    // Add endpoints related to annotations
    status.annotations = `${baseUrl}annotations`
  }
  // Explicitly disable types (not yet supported in jskos-server)
  status.types = null
  status.validate = `${baseUrl}validate`
  return status
} })

export default config
