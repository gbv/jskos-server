import _ from "lodash"

import AJV from "ajv"
import addAjvFormats from "ajv-formats"

import configSchema from "./config.schema.json" with { type: "json" }
import statusSchema from "../status.schema.json" with { type: "json" }
import configDefault from "./config.default.json" with { type: "json" }
import info from "../package.json" with { type: "json" }

const ajv = new AJV({ allErrors: true })
addAjvFormats(ajv)
ajv.addSchema(configSchema)
ajv.addSchema(statusSchema)

function ajvErrorsToString(errors) {
  let message = ""
  for (let error of errors || []) {
    switch (error.keyword) {
      case "additionalProperties":
        message += `${error.dataPath} ${error.message} (${error.params.additionalProperty})`
        break
      default:
        message += `${error.dataPath} ${error.message} (${error.schemaPath})`
    }
    message += "\n      "
  }
  return message.trimEnd()
}

export function validateConfig(data) {
  if (!ajv.validate(configSchema, data)) {
    throw new Error(ajvErrorsToString(ajv.errors))
  }
  for (let type in (data.registries?.types || {})) {
    if (data.registries.types[type].mustExist && data.registries.types[type].uriRequired === false) {
      throw new Error(`Registry member type ${type} mustExist so uriRequired must not be false`)
    }
  }
  return data
}

export function validateStatus(data) {
  if (!ajv.validate(statusSchema, data)) {
    throw new Error(ajvErrorsToString(ajv.errors))
  }
  return data
}

export function setupConfig(config) {
  config.env = config.env ?? "development"
  const testing = config.env === "test"

  // Merge in default values
  config = _.defaultsDeep(config, configDefault)
  const defaultChangesConfig = { retries: 20, interval: 5000 }
  if (config.changes === true) {
    config.changes = defaultChangesConfig
  } else if (config.changes) {
    config.changes = { ...defaultChangesConfig, ...config.changes }
  }

  // Add versions from package
  config.version = info.apiVersion
  config.serverVersion = info.version

  // Logging functions
  config.log = (...args) => {
    if (!testing && (config.verbosity === true || config.verbosity === "log")) {
      console.log(new Date(), ...args)
    }
  }
  config.warn = (...args) => {
    if (!testing && (config.verbosity === true || config.verbosity === "log" || config.verbosity === "warn")) {
      console.warn(new Date(), ...args)
    }
  }
  config.error = (...args) => {
    if (!testing && config.verbosity !== false) {
      console.error(new Date(), ...args)
    }
  }

  // Set composed config variables
  config.mongo.auth = config.mongo.user ? `${config.mongo.user}:${config.mongo.pass}@` : ""
  config.mongo.url = `mongodb://${config.mongo.auth}${config.mongo.host}:${config.mongo.port}`
  // Adjust database name during tests
  if (testing) {
    config.mongo.db += "-test-" + config.namespace
  }

  // Set baseUrl to localhost if not set
  if (!config.baseUrl) {
    Object.defineProperty(config, "baseUrl", {
      get: function () {
        return `http://localhost:${this.port}/`
      },
    })
  }
  if (!config.baseUrl.endsWith("/")) {
    config.baseUrl += "/"
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
  const allTypes = ["schemes", "concepts", "mappings", "concordances", "annotations", "registries"]
  for (let type of allTypes) {
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
    }
  }

  // mappings: if anonymous is given, assume crossUser for update and delete
  if (config.mappings?.anonymous) {
    if (config.mappings.update) {
      config.mappings.update.crossUser = true
    }
    if (config.mappings.delete) {
      config.mappings.delete.crossUser = true
    }
  }

  // registries: assume types as enabled above
  if (config.registries) {
    // default types
    if (!config.registries.types) {
      config.registries.types = Object.fromEntries(allTypes.map(type => [type, !!config[type]]))
    }
    const { types } = config.registries
    for (let type in types) {
      // default values
      if (types[type] === true) {
        types[type] = {
          mustExist: false,
          ignoreErrors: false,
        }
      }
      if (types[type] && !("uriRequired" in types[type])) {
        types[type].uriRequired = true
      }
      if (types[type]?.mustExist && !config[type]?.read) {
        config.warn(`registry with member type ${type} require URI but config.${type}.read is not enabled!`)
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
    if (["HS256", "HS384", "HS512"].includes(status?.config?.auth?.algorithm)) {
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
      "registries",
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
    if (status.config.registries) {
      status.registries = `${baseUrl}registries`
    }
    // Explicitly disable types (not yet supported in jskos-server)
    status.types = null
    status.validate = `${baseUrl}validate`
    return status
  } })

  return config
}
