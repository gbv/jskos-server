const _ = require("lodash")
const config = require("../config")

module.exports = class StatusService {

  /**
   * Return a Promise with a status object.
   */
  async getStatus({ baseUrl }) {
    const { db } = require("../server")
    let status = {
      config: _.omit(config, ["verbosity", "port", "mongo"]),
    }
    status.config.baseUrl = baseUrl
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
      status.config.auth.canSaveMappings = status.config.auth.key != null || !status.config.auth.postAuthRequired
      status.config.auth.canRemoveMappings = status.config.auth.key != null
    } else {
      status.config.auth.canSaveMappings = false
      status.config.auth.canRemoveMappings = false
    }
    if (status.config.annotations) {
      // Add endpoints related to annotations
      status.annotations = `${baseUrl}annotations`
    }
    status.ok = db.readyState === 1 ? 1 : 0
    return status
  }

}
