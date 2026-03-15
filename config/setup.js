import _ from "lodash"
import fs from "node:fs"

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

export function loadConfig(file) {
  try {
    const config = JSON.parse(fs.readFileSync(file))
    console.log(`Read configuration from ${file}`)
    return validateConfig(config)
  } catch(error) {
    throw new Error(`Could not read and validate configuration file ${file}: ${error}`)
  }
}

export function validateStatus(data) {
  if (!ajv.validate(statusSchema, data)) {
    throw new Error(ajvErrorsToString(ajv.errors))
  }
  return data
}

export function setupConfig(config) {
  config.env = config.env ?? "development"
  const { env, verbosity } = config

  // Merge in default values
  config = _.defaultsDeep(config, configDefault)

  const changesDefault = { retries: 20, interval: 5000 }
  if (config.changes === true) {
    config.changes = changesDefault
  } else if (config.changes) {
    config.changes = { ...changesDefault, ...config.changes }
  }

  // Add versions from package
  config.version = info.apiVersion
  config.serverVersion = info.version

  // Logging functions
  config.log = (...args) => {
    if (!env !== "test" && (verbosity === true || verbosity === "log")) {
      console.log(new Date(), ...args)
    }
  }
  config.warn = (...args) => {
    if (!env !== "test" && (verbosity === true || verbosity === "log" || verbosity === "warn")) {
      console.warn(new Date(), ...args)
    }
  }
  config.error = (...args) => {
    if (!env !== "test" && verbosity !== false) {
      console.error(new Date(), ...args)
    }
  }

  // Set composed config variables
  config.mongo.auth = config.mongo.user ? `${config.mongo.user}:${config.mongo.pass}@` : ""
  config.mongo.url = `mongodb://${config.mongo.auth}${config.mongo.host}:${config.mongo.port}`

  // Set baseUrl to localhost if not set
  if (!config.baseUrl) {
    // TODO: use normal property once port is set *before* setup
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
      // Fill in origin of URIs
      if (config[type].create) {
        const { uriBase, uriOrigin } = config[type].create
        if (!uriOrigin) {
          config[type].create.uriOrigin = "external"
        } else if (uriOrigin !== "external" && uriBase === false) {
          throw new Error(`uriBase of ${type}.create must not be false if uriOrigin is not external`)
        }
        // TODO: hard-coded settings for mappings, concordances, and annotations
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
          skipInvalid: false,
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
  // TODO: use `service` instead
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

  return config
}
