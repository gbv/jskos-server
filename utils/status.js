import _ from "lodash"

export function serverStatus(config, ok) {
  const { baseUrl } = config
  const status = {
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
    status.schemes = `${baseUrl}voc`
    status.top = `${baseUrl}voc/top`
    status["voc-search"] = `${baseUrl}voc/search`
    status["voc-suggest"] = `${baseUrl}voc/suggest`
    status["voc-concepts"] = `${baseUrl}voc/concepts`
  }
  if (status.config.concepts) {
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
    status.annotations = `${baseUrl}annotations`
  }
  if (status.config.registries) {
    status.registries = `${baseUrl}registries`
  }
  status.types = null // not supported in jskos-server yet
  status.validate = `${baseUrl}validate`

  status.ok = ok ? 1 : 0

  return status
}
