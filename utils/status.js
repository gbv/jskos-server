import info from "../package.json" with { type: "json" }

export class OpenAPI {
  constructor(config) {
    this.baseUrl = config.baseUrl
    this.description = {
      openapi: "3.2.0",
      info: {
        title: "JSKOS API",
        version: info.apiVersion,
      },
      servers: [{
        title: config.title,
        url: config.baseUrl,
        "x-version": info.version,
      }],
      paths: {},
      externalDocs: {
        description: "full documentation",
        url: "https://github.com/gbv/jskos-server#readme",
      },
    }

    if (config.auth) {
      this.description.components = {
        securitySchemes: {
          bearerJWT: {
            // TODO: algorithm, key, server
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      }
    }
  }

  addPath(path, item) {
    this.description.paths[path] = item
    for (let method in item) {
      path = path.replaceAll("{",":_").replaceAll(/[^a-z_]/g,"")
      item[method].externalDocs = {
        description: "documentation",
        url: `https://github.com/gbv/jskos-server#${method}-${path}`,
      }
    }
  }

  getEndpoint(path, operation) {
    this.addPath(path, { get: operation })
  }

  enableRoutes(basePath, paths) {
    for (let [path,item] of Object.entries(paths)) {
      this.addPath(basePath + path, item)
    }
  }
}

export function serverStatus(config, ok) {
  // eslint-disable-next-line no-unused-vars
  const { log, warn, error, verbosity, port, mongo, namespace, proxies, ips, ...publicConfig } = config
  config = structuredClone(publicConfig)

  // Remove `ips` property from all actions
  for (let type of ["schemes", "concepts", "mappings", "concordances", "annotations"]) {
    if (config[type]) {
      delete config[type].ips
      for (let action of ["read", "create", "update", "delete"]) {
        if (config[type][action]) {
          delete config[type][action].ips
        }
      }
    }
  }

  // Purge `key` from auth config if a symmetric algorithm is used
  if (["HS256", "HS384", "HS512"].includes(config.auth?.algorithm)) {
    config.auth.key = ""
  }

  const status = { config }

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

  const { baseUrl } = config
  status.data = `${baseUrl}data`
  if (config.schemes) {
    status.schemes = `${baseUrl}voc`
    status.top = `${baseUrl}voc/top`
    status["voc-search"] = `${baseUrl}voc/search`
    status["voc-suggest"] = `${baseUrl}voc/suggest`
    status["voc-concepts"] = `${baseUrl}voc/concepts`
  }
  if (config.concepts) {
    status.concepts = `${baseUrl}concepts`
    status.narrower = `${baseUrl}concepts/narrower`
    status.ancestors = `${baseUrl}concepts/ancestors`
    status.search = `${baseUrl}concepts/search`
    status.suggest = `${baseUrl}concepts/suggest`
  }
  if (config.mappings) {
    status.mappings = `${baseUrl}mappings`
  }
  if (config.concordances) {
    status.concordances = `${baseUrl}concordances`
  }
  if (config.annotations) {
    status.annotations = `${baseUrl}annotations`
  }
  if (config.registries) {
    status.registries = `${baseUrl}registries`
  }
  status.types = null // not supported in jskos-server yet
  status.validate = `${baseUrl}validate`

  status.ok = ok ? 1 : 0

  return status
}
