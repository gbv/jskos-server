const _ = require("lodash")
const config = require("../config")
const util = require("../lib/util")

/**
 * Provide statistics and connection status.
 */
class StatusProvider {

  constructor(db) {
    this.db = db
  }

  getStatus(req) {
    let status = {
      config: _.omit(config, ["verbosity", "port", "mongo"])
    }
    status.config.baseUrl = util.getBaseUrl(req)
    let baseUrl = status.config.baseUrl
    if (status.config.schemes) {
      // Add endpoints related to schemes
      status.schemes = `${baseUrl}voc`
      status.top = `${baseUrl}voc/top`
    }
    if (status.config.concepts) {
      // Add endpoints related to concepts
      status.concepts = `${baseUrl}voc/concepts`
      status.data = `${baseUrl}data`
      status.narrower = `${baseUrl}narrower`
      status.ancestors = `${baseUrl}ancestors`
      status.suggest = `${baseUrl}suggest`
      status.search = `${baseUrl}search`
    }
    if (status.config.mappings) {
      // Add endpoints related to mappings
      status.concordances = `${baseUrl}concordances`
      status.mappings = `${baseUrl}mappings`
      status.config.canSaveMappings = true
      status.config.canRemoveMappings = true
    } else {
      status.config.canSaveMappings = false
      status.config.canRemoveMappings = false
    }
    if (status.config.annotations) {
      // Add endpoints related to annotations
      status.annotations = `${baseUrl}annotations`
    }
    return this.db.stats().then(result => {
      status.ok = result.ok
    }).catch(error => {
      console.log("Error on /status:", error)
      status.ok = 0
    }).then(() => status)
  }

}

module.exports = StatusProvider
