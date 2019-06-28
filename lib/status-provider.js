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
    return this.db.stats().then(result => {
      status.ok = result.ok
    }).catch(error => {
      console.log("Error on /status:", error)
      status.ok = 0
    }).then(() => status)
  }

}

module.exports = StatusProvider
